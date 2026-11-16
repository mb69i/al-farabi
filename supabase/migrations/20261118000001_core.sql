-- Core schema for the Al-Farabi conference system.
-- Every table has RLS on and NO policies, and anon/authenticated have no table
-- privileges at all: all access goes through checked SECURITY DEFINER functions.

create extension if not exists pgcrypto with schema extensions;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_ar text not null,
  name_en text not null,
  starts_on date not null,
  ends_on date not null,
  registration_open boolean not null default false,
  cards_enabled boolean not null default false,
  certificates_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('owner', 'admin', 'doctor')),
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  serial text not null unique,
  full_name text not null,
  name_script text not null check (name_script in ('ar', 'en', 'mixed')),
  phone text not null,
  email text not null,
  gender text not null check (gender in ('male', 'female')),
  guest_type text not null check (guest_type in ('visitor', 'student', 'other')),
  workplace text not null,
  specialization text not null,
  lang text not null check (lang in ('ar', 'en')),
  is_vip boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, phone),
  unique (event_id, email)
);
create index guests_event_created_idx on public.guests (event_id, created_at desc);

create table public.guest_checkins (
  guest_id uuid not null references public.guests (id) on delete cascade,
  day date not null,
  at timestamptz not null default now(),
  primary key (guest_id, day)
);

create table public.researchers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name_ar text not null,
  name_en text,
  email text not null,
  phone text,
  gender text check (gender in ('male', 'female')),
  institution text,
  research_title text not null,
  search_key text not null default '',
  is_vip boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, email, research_title)
);
create index researchers_event_idx on public.researchers (event_id);

create table public.researcher_signoffs (
  id uuid primary key default gen_random_uuid(),
  researcher_id uuid not null unique references public.researchers (id) on delete cascade,
  day date not null,
  signature_path text not null,
  strokes_path text,
  sig_sha256 text not null,
  doctor_id uuid references public.staff (user_id) on delete set null,
  device text,
  signed_at timestamptz not null default now()
);

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('card', 'certificate')),
  forma_path text not null,
  width int not null,
  height int not null,
  layout jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  unique (event_id, kind)
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind text not null check (kind in ('card', 'certificate')),
  guest_id uuid references public.guests (id) on delete cascade,
  researcher_id uuid references public.researchers (id) on delete cascade,
  to_email text not null,
  lang text not null check (lang in ('ar', 'en')),
  status text not null check (status in ('queued', 'waiting_template', 'disabled', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  provider_id text,
  file_path text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  check (num_nonnulls(guest_id, researcher_id) = 1),
  unique (kind, guest_id),
  unique (kind, researcher_id)
);
create index deliveries_queue_idx on public.deliveries (status, next_attempt_at);
create index deliveries_event_idx on public.deliveries (event_id, created_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  target text,
  details jsonb
);

alter table public.events enable row level security;
alter table public.staff enable row level security;
alter table public.guests enable row level security;
alter table public.guest_checkins enable row level security;
alter table public.researchers enable row level security;
alter table public.researcher_signoffs enable row level security;
alter table public.templates enable row level security;
alter table public.deliveries enable row level security;
alter table public.audit_log enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------- helpers ----------

-- Must match src/lib/normalize.ts normalizeArabicForSearch exactly.
create function public.normalize_search(s text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
    translate(
      regexp_replace(lower(coalesce(s, '')), '[ً-ْـ]', '', 'g'),
      'أإآٱةىؤئ', 'ااااهيوي'),
    '\s+', ' ', 'g'))
$$;

create function public.baghdad_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Baghdad')::date
$$;

-- Effective role for authorisation: admin/owner only count after the authenticator step (aal2).
create function public.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select case
           when s.role in ('owner', 'admin') and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then null
           else s.role
         end
  from public.staff s
  where s.user_id = auth.uid() and s.active
$$;

create function public.require_role(variadic roles text[]) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare r text := public.my_role();
begin
  if r is null or not (r = any (roles)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- What the UI needs to route a staff member: role ignores aal so an aal1 admin is sent to the authenticator step.
create function public.whoami() returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'role', (select s.role from public.staff s where s.user_id = auth.uid() and s.active),
    'aal', coalesce(auth.jwt() ->> 'aal', 'aal1'),
    'email', coalesce((select s.email from public.staff s where s.user_id = auth.uid()), auth.jwt() ->> 'email'))
$$;

create function public.audit(p_action text, p_target text, p_details jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor, action, target, details) values (auth.uid(), p_action, p_target, p_details)
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.whoami() to authenticated;

-- ---------- seed ----------
insert into public.events (slug, name_ar, name_en, starts_on, ends_on)
values (
  'alfarabi-conf-2026',
  'مؤتمر الفارابي للبحوث التطبيقية في التحول الرقمي الشامل',
  'Al-Farabi Conference on Applied Research in Comprehensive Digital Transformation',
  '2026-11-21', '2026-11-22');
