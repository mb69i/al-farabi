-- Task 3 tests: registration, day check-in, event info, hall counters. Rolled back.
begin;
-- card-queue checks: registrations here should not also queue certificates (see cert_on_register.sql)
alter table public.guests disable trigger guests_queue_certificate;

-- helper: register as anon with sensible defaults
create function pg_temp.reg(phone text, email text, name text default 'Ali Hasan') returns json
language sql as $$
  select public.register_guest('alfarabi-conf-2026', name, phone, email, 'male', 'visitor', 'UoB', 'CS', 'en')
$$;
grant execute on function pg_temp.reg(text, text, text) to anon;

-- open registration, enable cards, add a card template
-- certificates off: this file tests the card queue (certificate-on-registration is in cert_on_register.sql)
update public.events set registration_open = true, cards_enabled = true, certificates_enabled = false where slug = 'alfarabi-conf-2026';
insert into public.templates (event_id, kind, forma_path, width, height, layout)
select id, 'card', 'x/card/forma.png', 100, 100, '{"fields":{}}' from public.events where slug = 'alfarabi-conf-2026';

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

-- get_public_event returns public fields incl. id
do $$ declare e json := public.get_public_event('alfarabi-conf-2026'); begin
  if (e->>'registration_open')::boolean is not true or e->>'id' is null or e->>'name_ar' is null then
    raise exception 'FAIL: get_public_event -> %', e;
  end if;
end $$;

-- register_guest creates guest, checkin and queued card when enabled with template
do $$ declare r json := pg_temp.reg('+9647701234567', 'ali@x.org'); begin
  if r->>'status' <> 'created' or r->>'serial' !~ '^ALF26-[A-HJ-NP-Z2-9]{6}$' or (r->>'checked_in_today')::boolean is not true then
    raise exception 'FAIL: created -> %', r;
  end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.guests where phone = '+9647701234567') <> 1 then raise exception 'FAIL: guest row'; end if;
  if (select count(*) from public.guest_checkins c join public.guests g on g.id = c.guest_id
      where g.phone = '+9647701234567' and c.day = public.baghdad_today()) <> 1 then raise exception 'FAIL: checkin row'; end if;
  if (select status from public.deliveries d join public.guests g on g.id = d.guest_id where g.phone = '+9647701234567') <> 'queued' then
    raise exception 'FAIL: card not queued';
  end if;
  if (select name_script from public.guests where phone = '+9647701234567') <> 'en' then raise exception 'FAIL: name_script'; end if;
end $$;

-- second registration same phone records checkin only (different email)
set local role anon;
do $$ declare r json := pg_temp.reg('+9647701234567', 'other@x.org'); begin
  if r->>'status' <> 'already_registered' or r->>'serial' is null then raise exception 'FAIL: dup phone -> %', r; end if;
end $$;
-- second registration same email different phone is already_registered
do $$ declare r json := pg_temp.reg('+9647709999999', 'ALI@x.org'); begin
  if r->>'status' <> 'already_registered' then raise exception 'FAIL: dup email -> %', r; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.guests) <> 1 then raise exception 'FAIL: duplicate guest created'; end if;
  if (select count(*) from public.deliveries) <> 1 then raise exception 'FAIL: duplicate card queued'; end if;
end $$;
-- the duplicate call returns the existing serial
create temp table t_serial on commit drop as select serial as s from public.guests limit 1;
grant select on t_serial to anon;
set local role anon;
do $$ begin
  if pg_temp.reg('+9647701234567', 'zzz@x.org')->>'serial' <> (select s from t_serial) then
    raise exception 'FAIL: duplicate did not return existing serial';
  end if;
end $$;

-- register_guest accepts international numbers (+98, +961, +213, +234, +61)
do $$ declare p text; i int := 0; r json; begin
  foreach p in array array['+989123456789', '+9613123456', '+213551234567', '+2348031234567', '+61412345678'] loop
    i := i + 1;
    r := pg_temp.reg(p, 'intl' || i || '@x.org');
    if r->>'status' <> 'created' then raise exception 'FAIL: % -> %', p, r; end if;
  end loop;
end $$;

-- register_guest rejects invalid input with the field name
do $$ declare r json; begin
  r := pg_temp.reg('+9647701111111', 'not-an-email');
  if r->>'status' <> 'invalid' or r->>'field' <> 'email' then raise exception 'FAIL: email -> %', r; end if;
  r := pg_temp.reg('07701111111', 'p@x.org');
  if r->>'status' <> 'invalid' or r->>'field' <> 'phone' then raise exception 'FAIL: phone -> %', r; end if;
  r := pg_temp.reg('+9647701111111', 'p@x.org', 'Al');
  if r->>'status' <> 'invalid' or r->>'field' <> 'full_name' then raise exception 'FAIL: name -> %', r; end if;
  r := public.register_guest('alfarabi-conf-2026', 'Ali Hasan', '+9647701111111', 'p@x.org', 'x', 'visitor', 'UoB', 'CS', 'en');
  if r->>'field' <> 'gender' then raise exception 'FAIL: gender -> %', r; end if;
  r := public.register_guest('alfarabi-conf-2026', 'Ali Hasan', '+9647701111111', 'p@x.org', 'male', 'researcher', 'UoB', 'CS', 'en');
  if r->>'field' <> 'guest_type' then raise exception 'FAIL: guest_type -> %', r; end if;
  r := public.register_guest('alfarabi-conf-2026', 'Ali Hasan', '+9647701111111', 'p@x.org', 'male', 'visitor', 'U', 'CS', 'en');
  if r->>'field' <> 'workplace' then raise exception 'FAIL: workplace -> %', r; end if;
end $$;
reset role;

-- register_guest queues disabled card when cards_enabled is false
update public.events set cards_enabled = false where slug = 'alfarabi-conf-2026';
set local role anon;
do $$ begin perform pg_temp.reg('+9647702222222', 'off@x.org'); end $$;
reset role;
do $$ begin
  if (select d.status from public.deliveries d join public.guests g on g.id = d.guest_id where g.email = 'off@x.org') <> 'disabled' then
    raise exception 'FAIL: card should be disabled';
  end if;
end $$;

-- waiting_template when cards are on but there is no card template
update public.events set cards_enabled = true where slug = 'alfarabi-conf-2026';
delete from public.templates;
set local role anon;
do $$ begin perform pg_temp.reg('+9647703333333', 'wait@x.org'); end $$;
reset role;
do $$ begin
  if (select d.status from public.deliveries d join public.guests g on g.id = d.guest_id where g.email = 'wait@x.org') <> 'waiting_template' then
    raise exception 'FAIL: card should wait for template';
  end if;
end $$;

-- checkin_guest needs both serial and phone
set local role anon;
do $$ declare r json; s text := (select s from t_serial); begin
  r := public.checkin_guest('alfarabi-conf-2026', s, '+9647700000000');
  if r->>'status' <> 'not_found' then raise exception 'FAIL: wrong phone -> %', r; end if;
  r := public.checkin_guest('alfarabi-conf-2026', 'ALF26-NOPE22', '+9647701234567');
  if r->>'status' <> 'not_found' then raise exception 'FAIL: wrong serial -> %', r; end if;
  r := public.checkin_guest('alfarabi-conf-2026', s, '+9647701234567');
  if r->>'status' <> 'ok' or (r->>'checked_in_today')::boolean is not true then raise exception 'FAIL: checkin -> %', r; end if;
end $$;

-- get_display_counts returns aggregates only
do $$ declare c json := public.get_display_counts('alfarabi-conf-2026'); keys text[]; begin
  select array_agg(k order by k) into keys from json_object_keys(c) k;
  if keys <> array['female','male','present_today','researchers_signed','researchers_total','total','vip'] then
    raise exception 'FAIL: keys %', keys;
  end if;
  if (c->>'total')::int <> 8 or (c->>'male')::int <> 8 then raise exception 'FAIL: counts %', c; end if;
end $$;
reset role;

-- present_today uses Baghdad date (yesterday's check-in does not count)
update public.guest_checkins set day = public.baghdad_today() - 1;
do $$ begin
  if (public.get_display_counts('alfarabi-conf-2026')->>'present_today')::int <> 0 then raise exception 'FAIL: present_today not by day'; end if;
end $$;
insert into public.guest_checkins (guest_id, day) select id, public.baghdad_today() from public.guests limit 1;
do $$ begin
  if (public.get_display_counts('alfarabi-conf-2026')->>'present_today')::int <> 1 then raise exception 'FAIL: present_today'; end if;
end $$;

-- register_guest returns closed when registration_open is false
update public.events set registration_open = false where slug = 'alfarabi-conf-2026';
set local role anon;
do $$ declare r json := pg_temp.reg('+9647704444444', 'closed@x.org'); begin
  if r->>'status' <> 'closed' then raise exception 'FAIL: closed -> %', r; end if;
  if public.checkin_guest('alfarabi-conf-2026', 'X', 'Y')->>'status' <> 'closed' then raise exception 'FAIL: checkin closed'; end if;
end $$;
reset role;

rollback;
select 'public.sql: all assertions passed' as result;
