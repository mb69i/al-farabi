-- Hall screen day/night mode: set by admins (aal2) only, read by the hall screen with its numbers. Rolled back.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d1', 'doctor@test.local', 'authenticated', 'authenticated');
insert into public.staff (user_id, email, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', 'admin'),
  ('00000000-0000-0000-0000-0000000000d1', 'doctor@test.local', 'doctor');

-- the hall screen (anon) gets the mode with the counts; default is automatic
set local role anon;
do $$ declare c json := public.get_display_counts('alfarabi-conf-2026'); begin
  if c->>'theme' is distinct from 'auto' then raise exception 'FAIL: default theme -> %', c->>'theme'; end if;
  if c->>'total' is null then raise exception 'FAIL: counts missing -> %', c; end if;
  begin perform public.admin_set_display_theme('night'); raise exception 'FAIL: anon changed theme';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- a doctor, and an admin without the authenticator code, cannot change it
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000d1","aal":"aal2"}', true);
do $$ begin
  begin perform public.admin_set_display_theme('night'); raise exception 'FAIL: doctor changed theme';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}', true);
do $$ begin
  begin perform public.admin_set_display_theme('night'); raise exception 'FAIL: aal1 admin changed theme';
  exception when insufficient_privilege then null; end;
end $$;

-- an admin with the code sets night, then day; junk is refused
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}', true);
do $$ begin
  if public.admin_set_display_theme('night') <> 'night' then raise exception 'FAIL: set night'; end if;
  if public.get_display_counts('alfarabi-conf-2026')->>'theme' <> 'night' then raise exception 'FAIL: night not shown'; end if;
  perform public.admin_set_display_theme('day');
  if (public.admin_overview('alfarabi-conf-2026'))->>'theme' <> 'day' then raise exception 'FAIL: overview theme'; end if;
  begin perform public.admin_set_display_theme('purple'); raise exception 'FAIL: bad theme accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.audit_log where action = 'display_theme') then raise exception 'FAIL: not audited'; end if;
end $$;
rollback;
select 'display_theme.sql: all assertions passed' as result;
