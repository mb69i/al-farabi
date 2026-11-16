-- Task 2 tests: core schema, locked-down RLS, role helpers.
-- Run through the Supabase connector; everything is rolled back.
begin;

-- Fixtures (as postgres)
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'doctor@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', 'authenticated', 'authenticated');
insert into public.staff (user_id, email, role, display_name) values
  ('00000000-0000-0000-0000-0000000000d1', 'doctor@test.local', 'doctor', 'Dr Test'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', 'admin', 'Admin Test');

-- anon cannot select any table
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare t text;
begin
  foreach t in array array['events','staff','guests','guest_checkins','researchers','researcher_signoffs','templates','deliveries','audit_log'] loop
    begin
      execute format('select 1 from public.%I limit 1', t);
      raise exception 'FAIL: anon could read %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
reset role;

-- authenticated (doctor) cannot read tables directly either
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000d1","aal":"aal1"}', true);
do $$
begin
  begin
    perform 1 from public.guests limit 1;
    raise exception 'FAIL: doctor could read guests';
  exception when insufficient_privilege then null;
  end;
end $$;

-- whoami for doctor returns role doctor
do $$
declare w json := public.whoami();
begin
  if w->>'role' is distinct from 'doctor' then raise exception 'FAIL: whoami doctor -> %', w; end if;
  if w->>'email' is distinct from 'doctor@test.local' then raise exception 'FAIL: whoami email -> %', w; end if;
end $$;

-- whoami for admin at aal1 reports role admin and aal aal1
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}', true);
do $$
declare w json := public.whoami();
begin
  if w->>'role' is distinct from 'admin' or w->>'aal' is distinct from 'aal1' then
    raise exception 'FAIL: whoami admin aal1 -> %', w;
  end if;
end $$;

-- whoami for a signed-in non-staff user returns role null
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000ff","aal":"aal1"}', true);
do $$
begin
  if public.whoami()->>'role' is not null then raise exception 'FAIL: non-staff got a role'; end if;
end $$;
reset role;

-- my_role for admin at aal1 is null and at aal2 is admin (checked as postgres with claims)
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}', true);
do $$ begin
  if public.my_role() is not null then raise exception 'FAIL: admin aal1 my_role=%', public.my_role(); end if;
end $$;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}', true);
do $$ begin
  if public.my_role() is distinct from 'admin' then raise exception 'FAIL: admin aal2 my_role=%', public.my_role(); end if;
end $$;

-- a deactivated staff member has no role
update public.staff set active = false where user_id = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  if public.my_role() is not null then raise exception 'FAIL: inactive admin still has a role'; end if;
end $$;

-- require_role raises insufficient_privilege for the wrong role
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000d1","aal":"aal1"}', true);
do $$ begin
  begin
    perform public.require_role('admin', 'owner');
    raise exception 'FAIL: doctor passed require_role(admin)';
  exception when insufficient_privilege then null;
  end;
  if public.require_role('doctor') <> '00000000-0000-0000-0000-0000000000d1' then
    raise exception 'FAIL: require_role(doctor) did not return uid';
  end if;
end $$;

-- normalize_search matches the client normaliser (src/lib/normalize.ts)
do $$ begin
  if public.normalize_search('أحْمَد  إبراهيم') <> 'احمد ابراهيم' then raise exception 'FAIL: hamza/diacritics -> %', public.normalize_search('أحْمَد  إبراهيم'); end if;
  if public.normalize_search('فاطمة') <> 'فاطمه' then raise exception 'FAIL: ta marbuta'; end if;
  if public.normalize_search('مصطفى') <> 'مصطفي' then raise exception 'FAIL: alef maqsura'; end if;
  if public.normalize_search('محـــمد') <> 'محمد' then raise exception 'FAIL: tatweel'; end if;
  if public.normalize_search('Ali  HASAN') <> 'ali hasan' then raise exception 'FAIL: latin'; end if;
end $$;

-- baghdad_today is the date in Baghdad
do $$ begin
  if public.baghdad_today() <> (now() at time zone 'Asia/Baghdad')::date then raise exception 'FAIL: baghdad_today'; end if;
end $$;

-- the event is seeded
do $$ begin
  if not exists (select 1 from public.events where slug = 'alfarabi-conf-2026' and starts_on = '2026-11-21' and ends_on = '2026-11-22') then
    raise exception 'FAIL: event not seeded';
  end if;
end $$;

-- no function in public is executable by anon except the ones granted later on purpose
do $$
declare bad text;
begin
  select string_agg(p.proname, ', ') into bad
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not in ('get_public_event','register_guest','checkin_guest','get_display_counts');
  if bad is not null then raise exception 'FAIL: anon can execute %', bad; end if;
end $$;

rollback;
select 'core.sql: all assertions passed' as result;
