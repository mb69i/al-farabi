-- "Attending as" removed from the form: registration works without a guest type. Rolled back.
begin;
update public.events set registration_open = true where slug = 'alfarabi-conf-2026';
set local role anon;
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.50"}', true);
do $$ declare r json; begin
  r := public.register_guest('alfarabi-conf-2026', 'Noor Ali', '+9647711112222', 'noor@x.org', 'female', null, 'UoB', 'CS', 'ar');
  if r->>'status' <> 'created' then raise exception 'FAIL: no guest type -> %', r; end if;
  -- an old client that still sends a type keeps working
  r := public.register_guest('alfarabi-conf-2026', 'Omar Ali', '+9647711113333', 'omar@x.org', 'male', 'student', 'UoB', 'CS', 'ar');
  if r->>'status' <> 'created' then raise exception 'FAIL: with guest type -> %', r; end if;
  -- an unknown type is still refused
  r := public.register_guest('alfarabi-conf-2026', 'Zaid Ali', '+9647711114444', 'zaid@x.org', 'male', 'hacker', 'UoB', 'CS', 'ar');
  if r->>'field' <> 'guest_type' then raise exception 'FAIL: bad type -> %', r; end if;
end $$;
reset role;
do $$ begin
  if (select guest_type from public.guests where email = 'noor@x.org') is not null then raise exception 'FAIL: stored a type'; end if;
  if (select guest_type from public.guests where email = 'omar@x.org') <> 'student' then raise exception 'FAIL: lost the type'; end if;
end $$;
rollback;
select 'no_guest_type.sql: all assertions passed' as result;
