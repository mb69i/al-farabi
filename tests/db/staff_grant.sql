-- owner_grant_staff_by_email: the owner gives an existing Supabase account a staff role. Rolled back.
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000b1', 'owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000e1', 'dr.ali@test.local', 'authenticated', 'authenticated');
insert into public.staff (user_id, email, role) values
  ('00000000-0000-0000-0000-0000000000b1', 'owner@test.local', 'owner'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', 'admin');

-- not callable by anon; callable by authenticated (checks owner inside)
do $$ begin
  if has_function_privilege('anon', 'public.owner_grant_staff_by_email(text,text,text)', 'execute') then
    raise exception 'FAIL: exposed to anon';
  end if;
end $$;

-- admin (aal2) is refused
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}', true);
do $$ begin
  begin
    perform public.owner_grant_staff_by_email('dr.ali@test.local', 'doctor', 'Dr Ali');
    raise exception 'FAIL: admin granted a role';
  exception when insufficient_privilege then null;
  end;
end $$;

-- owner (aal2) grants doctor to an existing account, case-insensitively
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000b1","aal":"aal2"}', true);
do $$ declare r json; begin
  r := public.owner_grant_staff_by_email('  DR.Ali@Test.Local ', 'doctor', 'Dr Ali');
  if r->>'status' <> 'ok' or r->>'user_id' <> '00000000-0000-0000-0000-0000000000e1' then raise exception 'FAIL: grant -> %', r; end if;
  -- unknown email
  r := public.owner_grant_staff_by_email('nobody@test.local', 'doctor', 'X');
  if r->>'status' <> 'no_account' then raise exception 'FAIL: unknown -> %', r; end if;
  -- owner role cannot be granted, and the owner cannot be changed
  begin
    perform public.owner_grant_staff_by_email('dr.ali@test.local', 'owner', 'X');
    raise exception 'FAIL: granted owner';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.owner_grant_staff_by_email('owner@test.local', 'doctor', 'X');
    raise exception 'FAIL: changed the owner';
  exception when invalid_parameter_value then null;
  end;
  -- re-granting updates the role and re-activates
  r := public.owner_grant_staff_by_email('dr.ali@test.local', 'admin', 'Dr Ali');
  if r->>'status' <> 'ok' then raise exception 'FAIL: regrant -> %', r; end if;
end $$;
reset role;

do $$ begin
  if (select role from public.staff where user_id = '00000000-0000-0000-0000-0000000000e1') <> 'admin' then raise exception 'FAIL: role not updated'; end if;
  if (select email from public.staff where user_id = '00000000-0000-0000-0000-0000000000e1') <> 'dr.ali@test.local' then raise exception 'FAIL: email'; end if;
  if (select count(*) from public.audit_log where action = 'staff_grant') <> 2 then raise exception 'FAIL: audit'; end if;
end $$;

rollback;
select 'staff_grant.sql: all assertions passed' as result;
