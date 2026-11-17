-- Rate limiting for the public functions (register_guest, checkin_guest).
-- Per client address (high, because a whole hall shares one campus Wi-Fi address) and a global
-- cap. A call refused by its address budget does not use the global budget, so one flooding
-- address cannot block everyone else. Only SHA-256 hashes of addresses are stored.

create table public.rate_limits (
  name text primary key,
  max_hits int not null,
  window_seconds int not null
);
insert into public.rate_limits (name, max_hits, window_seconds) values
  ('register_ip', 120, 60),        -- 120 per minute per address
  ('register_global', 3000, 600);  -- 3000 per 10 minutes overall

create table public.rate_hits (
  name text not null,
  key text not null,
  bucket timestamptz not null,
  hits int not null default 0,
  primary key (name, key, bucket)
);

alter table public.rate_limits enable row level security;
alter table public.rate_hits enable row level security;
revoke all on public.rate_limits, public.rate_hits from anon, authenticated;

-- The caller's address as seen by the Supabase gateway.
create function public.client_ip() returns text
language sql stable set search_path = '' as $$
  select coalesce(
    nullif(btrim(split_part(coalesce(
      nullif(current_setting('request.headers', true), '')::json ->> 'cf-connecting-ip',
      nullif(current_setting('request.headers', true), '')::json ->> 'x-forwarded-for',
      ''), ',', 1)), ''),
    'unknown')
$$;

-- Counts one hit; true while still within the limit.
create function public.take_rate(p_name text, p_key text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  lim public.rate_limits;
  v_bucket timestamptz;
  n int;
begin
  select * into lim from public.rate_limits where name = p_name;
  if lim.name is null then
    return true;
  end if;
  v_bucket := to_timestamp(floor(extract(epoch from now()) / lim.window_seconds) * lim.window_seconds);
  insert into public.rate_hits (name, key, bucket, hits)
  values (p_name, encode(extensions.digest(p_key, 'sha256'), 'hex'), v_bucket, 1)
  on conflict (name, key, bucket) do update set hits = public.rate_hits.hits + 1
  returning hits into n;
  return n <= lim.max_hits;
end $$;

create function public.public_call_allowed() returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.take_rate('register_ip', public.client_ip()) then
    return false;
  end if;
  return public.take_rate('register_global', 'all');
end $$;

create or replace function public.register_guest(
  p_slug text, p_full_name text, p_phone text, p_email text, p_gender text,
  p_guest_type text, p_workplace text, p_specialization text, p_lang text)
returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  ev public.events;
  v_name text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_phone text := btrim(coalesce(p_phone, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_work text := regexp_replace(btrim(coalesce(p_workplace, '')), '\s+', ' ', 'g');
  v_spec text := regexp_replace(btrim(coalesce(p_specialization, '')), '\s+', ' ', 'g');
  v_lang text := case when p_lang = 'en' then 'en' else 'ar' end;
  v_script text;
  v_today date := public.baghdad_today();
  g record;
  v_id uuid;
  v_serial text;
begin
  select * into ev from public.events where slug = p_slug;
  if ev.id is null or not ev.registration_open then
    return json_build_object('status', 'closed', 'checked_in_today', false);
  end if;
  if not public.public_call_allowed() then
    return json_build_object('status', 'rate_limited', 'checked_in_today', false);
  end if;

  if char_length(v_name) not between 3 and 120 then
    return json_build_object('status', 'invalid', 'field', 'full_name', 'checked_in_today', false);
  elsif v_phone !~ '^\+[1-9][0-9]{7,14}$' or v_phone ~ '^\+9640' then
    return json_build_object('status', 'invalid', 'field', 'phone', 'checked_in_today', false);
  elsif char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return json_build_object('status', 'invalid', 'field', 'email', 'checked_in_today', false);
  elsif p_gender is null or p_gender not in ('male', 'female') then
    return json_build_object('status', 'invalid', 'field', 'gender', 'checked_in_today', false);
  elsif p_guest_type is null or p_guest_type not in ('visitor', 'student', 'other') then
    return json_build_object('status', 'invalid', 'field', 'guest_type', 'checked_in_today', false);
  elsif char_length(v_work) not between 2 and 160 then
    return json_build_object('status', 'invalid', 'field', 'workplace', 'checked_in_today', false);
  elsif char_length(v_spec) not between 2 and 160 then
    return json_build_object('status', 'invalid', 'field', 'specialization', 'checked_in_today', false);
  end if;

  v_script := case
    when v_name ~ '[؀-ۿ]' and v_name ~ '[A-Za-z]' then 'mixed'
    when v_name ~ '[؀-ۿ]' then 'ar'
    else 'en' end;

  for attempt in 1..5 loop
    select id, serial into g from public.guests
     where event_id = ev.id and (phone = v_phone or email = v_email)
     order by created_at limit 1;
    if g.id is not null then
      insert into public.guest_checkins (guest_id, day) values (g.id, v_today) on conflict do nothing;
      return json_build_object('status', 'already_registered', 'serial', g.serial, 'checked_in_today', true);
    end if;

    begin
      v_serial := public.new_serial();
      insert into public.guests (event_id, serial, full_name, name_script, phone, email, gender, guest_type,
                                 workplace, specialization, lang)
      values (ev.id, v_serial, v_name, v_script, v_phone, v_email, p_gender, p_guest_type, v_work, v_spec, v_lang)
      returning id into v_id;
    exception when unique_violation then
      continue;
    end;

    insert into public.guest_checkins (guest_id, day) values (v_id, v_today);
    insert into public.deliveries (event_id, kind, guest_id, to_email, lang, status)
    values (ev.id, 'card', v_id, v_email, v_lang, public.delivery_initial_status(ev.id, 'card'));
    return json_build_object('status', 'created', 'serial', v_serial, 'checked_in_today', true);
  end loop;
  raise exception 'could not register guest';
end $$;

create or replace function public.checkin_guest(p_slug text, p_serial text, p_phone text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  ev public.events;
  v_id uuid;
begin
  select * into ev from public.events where slug = p_slug;
  if ev.id is null or not ev.registration_open then
    return json_build_object('status', 'closed', 'checked_in_today', false);
  end if;
  if not public.public_call_allowed() then
    return json_build_object('status', 'rate_limited', 'checked_in_today', false);
  end if;
  select id into v_id from public.guests
   where event_id = ev.id and serial = upper(btrim(coalesce(p_serial, ''))) and phone = btrim(coalesce(p_phone, ''));
  if v_id is null then
    return json_build_object('status', 'not_found', 'checked_in_today', false);
  end if;
  insert into public.guest_checkins (guest_id, day) values (v_id, public.baghdad_today()) on conflict do nothing;
  return json_build_object('status', 'ok', 'checked_in_today', true);
end $$;

select cron.schedule('rate-hits-cleanup', '17 * * * *', $$delete from public.rate_hits where bucket < now() - interval '1 day'$$);

revoke execute on function public.client_ip(), public.take_rate(text, text), public.public_call_allowed()
  from public, anon, authenticated;
grant execute on function public.register_guest(text, text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.checkin_guest(text, text, text) to anon, authenticated;
