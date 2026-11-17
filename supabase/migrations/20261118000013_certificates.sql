-- Certificates and public verification (item 8).
-- Each issued certificate has its own long serial (ALF26-XXXX-XXXX-XXXX, 60 random bits), separate
-- from the 6-character attendance-card serial, so a printed certificate cannot be guessed and the
-- card serial (used with the phone number to check in) is never exposed as a certificate.
-- The table stores the name exactly as printed. Clients never read it directly: the only public
-- door is verify_certificate(), which returns name / event / date / role and is rate-limited.

create table public.certificates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  serial text not null unique,
  serial_key text generated always as (upper(regexp_replace(serial, '[^A-Za-z0-9]', '', 'g'))) stored unique,
  role text not null check (role in ('attendee', 'researcher')),
  guest_id uuid references public.guests (id) on delete cascade,
  researcher_id uuid references public.researchers (id) on delete cascade,
  name text not null,
  date_from date not null,
  date_to date not null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(guest_id, researcher_id) = 1),
  check (date_to >= date_from),
  unique (role, guest_id),
  unique (role, researcher_id)
);
alter table public.certificates enable row level security;
revoke all on public.certificates from anon, authenticated;

insert into public.rate_limits (name, max_hits, window_seconds) values
  ('verify_ip', 30, 60),         -- 30 lookups per minute per address (a hall can share one address)
  ('verify_global', 3000, 600)   -- 3000 per 10 minutes overall
on conflict (name) do nothing;

create function public.new_certificate_serial() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 letters: no 0/O, 1/I
  b bytea := extensions.gen_random_bytes(12);
  out text := 'ALF26';
begin
  for i in 0..11 loop
    if i % 4 = 0 then
      out := out || '-';
    end if;
    out := out || substr(alphabet, (get_byte(b, i) % 32) + 1, 1); -- 256 % 32 = 0, so unbiased
  end loop;
  return out;
end $$;

-- Issues (or returns the existing) certificate for one guest or researcher. Server-side only:
-- the certificate engine calls it with the service key; staff screens can wrap it later.
create function public.issue_certificate(p_role text, p_guest_id uuid, p_researcher_id uuid,
                                         p_date_from date, p_date_to date) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_event uuid;
  v_name text;
  v_serial text;
begin
  if p_role = 'attendee' and p_guest_id is not null and p_researcher_id is null then
    select event_id, full_name into v_event, v_name from public.guests where id = p_guest_id;
    select serial into v_serial from public.certificates where role = p_role and guest_id = p_guest_id;
  elsif p_role = 'researcher' and p_researcher_id is not null and p_guest_id is null then
    select event_id, coalesce(name_ar, name_en) into v_event, v_name from public.researchers where id = p_researcher_id;
    select serial into v_serial from public.certificates where role = p_role and researcher_id = p_researcher_id;
  else
    raise exception 'issue_certificate: role and person do not match';
  end if;
  if v_event is null then
    raise exception 'issue_certificate: person not found';
  end if;
  if v_serial is not null then
    return v_serial;
  end if;
  if p_date_from is null or p_date_to is null or p_date_to < p_date_from then
    raise exception 'issue_certificate: bad dates';
  end if;
  for attempt in 1..5 loop
    begin
      v_serial := public.new_certificate_serial();
      insert into public.certificates (event_id, serial, role, guest_id, researcher_id, name, date_from, date_to)
      values (v_event, v_serial, p_role, p_guest_id, p_researcher_id, v_name, p_date_from, p_date_to);
      return v_serial;
    exception when unique_violation then
      -- serial clash (practically never) or a parallel call for the same person: look again
      select serial into v_serial from public.certificates
       where role = p_role and (guest_id = p_guest_id or researcher_id = p_researcher_id);
      if v_serial is not null then
        return v_serial;
      end if;
    end;
  end loop;
  raise exception 'issue_certificate: could not create a serial';
end $$;

-- Public lookup for /verify?s=SERIAL. Returns only what is printed on the certificate.
create function public.verify_certificate(p_serial text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_key text := upper(regexp_replace(left(coalesce(p_serial, ''), 64), '[^A-Za-z0-9]', '', 'g'));
  c record;
begin
  -- every lookup counts, found or not, so serials cannot be tried in bulk
  -- (address first: a refused address does not use up the global budget)
  if not public.take_rate('verify_ip', public.client_ip()) then
    return json_build_object('status', 'rate_limited');
  end if;
  if not public.take_rate('verify_global', 'all') then
    return json_build_object('status', 'rate_limited');
  end if;
  if char_length(v_key) <> 17 then -- ALF26 + 12
    return json_build_object('status', 'not_found');
  end if;
  select ce.serial, ce.name, ce.role, ce.date_from, ce.date_to, e.name_ar, e.name_en into c
    from public.certificates ce join public.events e on e.id = ce.event_id
   where ce.serial_key = v_key;
  if c.serial is null then
    return json_build_object('status', 'not_found');
  end if;
  return json_build_object('status', 'valid', 'serial', c.serial, 'name', c.name, 'role', c.role,
                           'event_ar', c.name_ar, 'event_en', c.name_en,
                           'date_from', c.date_from, 'date_to', c.date_to);
end $$;

revoke execute on function public.new_certificate_serial(), public.issue_certificate(text, uuid, uuid, date, date)
  from public, anon, authenticated;
revoke execute on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;
