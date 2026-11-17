-- Certificate verification (item 8): long printed serials, public lookup that returns only
-- name / event / date / role, rate-limited per address. Rolled back.
begin;

update public.rate_limits set max_hits = 4 where name = 'verify_ip';

do $$
declare
  ev uuid := (select id from public.events where slug = 'alfarabi-conf-2026');
  g uuid; r uuid; s1 text; s2 text; s3 text;
begin
  insert into public.guests (event_id, serial, full_name, name_script, phone, email, gender, guest_type, workplace, specialization, lang)
  values (ev, 'ALF26-VTEST1', 'زينب حسن علي', 'ar', '+9647700099901', 'verify.guest@example.org', 'female', 'visitor', 'UoB', 'CS', 'ar')
  returning id into g;
  insert into public.researchers (event_id, name_ar, name_en, email, phone, research_title)
  values (ev, 'علي كريم', 'Ali Kareem', 'verify.res@example.org', '+9647700099902', 'Verify test research')
  returning id into r;

  s1 := public.issue_certificate('attendee', g, null, '2026-11-21', '2026-11-22');
  s2 := public.issue_certificate('researcher', null, r, '2026-11-21', '2026-11-21');
  -- printed serials are long: ALF26-XXXX-XXXX-XXXX (60 random bits)
  if s1 !~ '^ALF26-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$' then raise exception 'FAIL: serial format %', s1; end if;
  if s1 = s2 then raise exception 'FAIL: serials repeat'; end if;
  -- issuing again for the same person and role returns the same serial
  s3 := public.issue_certificate('attendee', g, null, '2026-11-21', '2026-11-22');
  if s3 <> s1 then raise exception 'FAIL: not idempotent % %', s1, s3; end if;
  -- the guest's attendance-card serial is not a certificate
  perform set_config('test.s1', s1, true);
  perform set_config('test.s2', s2, true);
end $$;

-- clients cannot read the table or issue certificates
do $$ begin
  if has_table_privilege('anon', 'public.certificates', 'select')
     or has_table_privilege('authenticated', 'public.certificates', 'select') then
    raise exception 'FAIL: certificates table exposed';
  end if;
  if has_function_privilege('anon', 'public.issue_certificate(text, uuid, uuid, date, date)', 'execute')
     or has_function_privilege('authenticated', 'public.issue_certificate(text, uuid, uuid, date, date)', 'execute') then
    raise exception 'FAIL: issue_certificate callable by clients';
  end if;
  if not has_function_privilege('anon', 'public.verify_certificate(text)', 'execute') then
    raise exception 'FAIL: verify_certificate not public';
  end if;
end $$;

set local role anon;
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.50"}', true);
do $$
declare
  j json;
  keys text[];
begin
  j := public.verify_certificate(current_setting('test.s1'));
  if j->>'status' <> 'valid' then raise exception 'FAIL: valid -> %', j; end if;
  select array_agg(k order by k) into keys from json_object_keys(j) k;
  if keys <> array['date_from', 'date_to', 'event_ar', 'event_en', 'name', 'role', 'serial', 'status'] then
    raise exception 'FAIL: unexpected fields %', keys;
  end if;
  if j->>'name' <> 'زينب حسن علي' or j->>'role' <> 'attendee' or j->>'date_from' <> '2026-11-21' or j->>'date_to' <> '2026-11-22' then
    raise exception 'FAIL: wrong values %', j;
  end if;
  if j::text ~ '(example\.org|\+964)' then raise exception 'FAIL: contact details leaked %', j; end if;

  -- lower case, spaces and missing dashes are forgiven
  j := public.verify_certificate(' ' || lower(replace(current_setting('test.s2'), '-', '')) || ' ');
  if j->>'status' <> 'valid' or j->>'role' <> 'researcher' or j->>'name' <> 'علي كريم' then raise exception 'FAIL: loose input -> %', j; end if;

  -- unknown serial, the attendance-card serial, and junk are all "not found"
  j := public.verify_certificate('ALF26-AAAA-BBBB-CCCC');
  if j->>'status' <> 'not_found' then raise exception 'FAIL: unknown -> %', j; end if;
  if j::text ~ 'name' then raise exception 'FAIL: not_found carries data %', j; end if;
  if public.verify_certificate('nonsense')->>'status' <> 'not_found' then raise exception 'FAIL: nonsense'; end if;
  -- 5th lookup from this address within the minute is refused
  j := public.verify_certificate(current_setting('test.s1'));
  if j->>'status' <> 'rate_limited' then raise exception 'FAIL: 5th lookup -> %', j; end if;
end $$;

-- another address is unaffected; junk input still counts but returns not_found
select set_config('request.headers', '{"x-forwarded-for": "198.51.100.77"}', true);
do $$ begin
  if public.verify_certificate('ALF26-VTEST1')->>'status' <> 'not_found' then raise exception 'FAIL: card serial verified'; end if;
  if public.verify_certificate(repeat('x', 500))->>'status' <> 'not_found' then raise exception 'FAIL: long junk'; end if;
  if public.verify_certificate(null)->>'status' <> 'not_found' then raise exception 'FAIL: null'; end if;
  if public.verify_certificate(current_setting('test.s1'))->>'status' <> 'valid' then raise exception 'FAIL: other address'; end if;
end $$;
reset role;

rollback;
select 'verify.sql: all assertions passed' as result;
