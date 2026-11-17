-- Rate limiting of the public registration/check-in functions. Rolled back.
begin;

update public.events set registration_open = true where slug = 'alfarabi-conf-2026';
-- tiny limits for the test
update public.rate_limits set max_hits = 3 where name = 'register_ip';
update public.rate_limits set max_hits = 5 where name = 'register_global';

-- the limit tables are not reachable by clients
do $$ begin
  if has_table_privilege('anon', 'public.rate_hits', 'select') or has_table_privilege('anon', 'public.rate_limits', 'select') then
    raise exception 'FAIL: rate tables exposed';
  end if;
end $$;

set local role anon;
select set_config('request.headers', '{"x-forwarded-for": "203.0.113.7, 10.0.0.1"}', true);
do $$ declare r json; begin
  for i in 1..3 loop
    r := public.register_guest('alfarabi-conf-2026', 'Guest ' || i, '+96477100000' || i, 'rl' || i || '@x.org',
                               'male', 'visitor', 'UoB', 'CS', 'en');
    if r->>'status' <> 'created' then raise exception 'FAIL: call % -> %', i, r; end if;
  end loop;
  -- 4th call from the same address in the same minute is refused, and nothing is stored
  r := public.register_guest('alfarabi-conf-2026', 'Guest 4', '+964771000004', 'rl4@x.org', 'male', 'visitor', 'UoB', 'CS', 'en');
  if r->>'status' <> 'rate_limited' then raise exception 'FAIL: 4th call -> %', r; end if;
  -- check-in shares the same per-address budget
  if public.checkin_guest('alfarabi-conf-2026', 'X', 'Y')->>'status' <> 'rate_limited' then raise exception 'FAIL: checkin not limited'; end if;
end $$;

-- another address still works until the global cap
select set_config('request.headers', '{"x-forwarded-for": "198.51.100.9"}', true);
do $$ declare r json; begin
  r := public.register_guest('alfarabi-conf-2026', 'Other Guest', '+964771000009', 'rl9@x.org', 'female', 'student', 'UoB', 'CS', 'ar');
  if r->>'status' <> 'created' then raise exception 'FAIL: other address -> %', r; end if;
end $$;
-- global cap: only calls that pass their address check count towards it (4 so far), so the
-- next address gets one more registration and is then refused

select set_config('request.headers', '{"x-forwarded-for": "192.0.2.44"}', true);
do $$ declare r json; begin
  r := public.register_guest('alfarabi-conf-2026', 'Third Guest', '+964771000010', 'rl10@x.org', 'female', 'student', 'UoB', 'CS', 'ar');
  r := public.register_guest('alfarabi-conf-2026', 'Fourth Guest', '+964771000011', 'rl11@x.org', 'female', 'student', 'UoB', 'CS', 'ar');
  if r->>'status' <> 'rate_limited' then raise exception 'FAIL: global cap -> %', r; end if;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.guests where email like 'rl%@x.org') <> 5 then
    raise exception 'FAIL: stored guests %', (select count(*) from public.guests where email like 'rl%@x.org');
  end if;
  -- only hashes of addresses are stored
  if exists (select 1 from public.rate_hits where key like '%203.0.113.7%') then raise exception 'FAIL: raw IP stored'; end if;
end $$;

rollback;
select 'rate_limit.sql: all assertions passed' as result;
