-- Governorate on registration, and hall-screen numbers that add up (owner, 19 Nov). Rolled back.
begin;
update public.events set registration_open = true where slug = 'alfarabi-conf-2026';
do $$
declare
  ev uuid := (select id from public.events where slug = 'alfarabi-conf-2026');
  res json; c json; n int;
begin
  -- the codes in the database are exactly the 18 governorates + outside Iraq (same list as src/lib/governorates.ts)
  if array_length(public.governorate_codes(), 1) <> 19 or not ('outside' = any(public.governorate_codes()))
     or not ('baghdad' = any(public.governorate_codes())) then
    raise exception 'FAIL: governorate list %', public.governorate_codes();
  end if;

  -- new form: governorate stored
  res := public.register_guest('alfarabi-conf-2026', 'علي حسن كريم', '+9647700008801', 'gov1@test.local', 'male', null,
                               'UoB', 'CS', 'ar', 'basra');
  if res->>'status' <> 'created' then raise exception 'FAIL: create with governorate -> %', res; end if;
  if (select governorate from public.guests where serial = res->>'serial') <> 'basra' then raise exception 'FAIL: not stored'; end if;

  -- unknown governorate refused, on its own field
  res := public.register_guest('alfarabi-conf-2026', 'زينب كاظم جواد', '+9647700008802', 'gov2@test.local', 'female', null,
                               'UoB', 'CS', 'ar', 'atlantis');
  if res->>'status' <> 'invalid' or res->>'field' <> 'governorate' then raise exception 'FAIL: bad governorate -> %', res; end if;

  -- the live (old) form calls with 9 arguments: still works, governorate left empty
  res := public.register_guest('alfarabi-conf-2026', 'زينب كاظم جواد', '+9647700008802', 'gov2@test.local', 'female', null,
                               'UoB', 'CS', 'ar');
  if res->>'status' <> 'created' then raise exception 'FAIL: old 9-argument call -> %', res; end if;
  if (select governorate from public.guests where serial = res->>'serial') is not null then raise exception 'FAIL: old call governorate'; end if;

  -- admin list and export carry it
  perform set_config('request.jwt.claims', json_build_object('sub', (select user_id from public.staff where role = 'owner' limit 1),
                                                              'role', 'authenticated', 'aal', 'aal2')::text, true);
  if (select count(*) from json_array_elements(public.admin_list_guests('alfarabi-conf-2026', 'gov1@', 10, 0)->'rows') r
       where r->>'governorate' = 'basra') <> 1 then
    raise exception 'FAIL: admin list has no governorate';
  end if;
  if (select count(*) from json_array_elements(public.admin_export('alfarabi-conf-2026')->'guests') r
       where r->>'governorate' = 'basra') <> 1 then
    raise exception 'FAIL: export has no governorate';
  end if;

  -- hall numbers: male + female = registered, VIP counts guests only (researchers have their own number)
  c := public.get_display_counts('alfarabi-conf-2026');
  n := (select count(*) from public.guests where event_id = ev);
  if (c->>'total')::int <> n then raise exception 'FAIL: total %', c; end if;
  if (c->>'male')::int + (c->>'female')::int <> (c->>'total')::int then
    raise exception 'FAIL: male + female <> total: %', c;
  end if;
  if (c->>'vip')::int <> (select count(*) from public.guests where event_id = ev and is_vip) then
    raise exception 'FAIL: vip counts researchers: %', c;
  end if;
end $$;
rollback;
select 'governorate_counts.sql: all assertions passed' as result;
