-- Footer contact details: everyone reads, only admins (aal2) change. Rolled back.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d1', 'doctor@test.local', 'authenticated', 'authenticated');
insert into public.staff (user_id, email, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', 'admin'),
  ('00000000-0000-0000-0000-0000000000d1', 'doctor@test.local', 'doctor');

do $$ begin
  if has_table_privilege('anon', 'public.site_settings', 'select') or has_table_privilege('anon', 'public.site_settings', 'update') then
    raise exception 'FAIL: settings table exposed';
  end if;
end $$;

-- anyone can read the contact block (with defaults present)
set local role anon;
do $$ declare c json := public.get_site_contact(); begin
  if c is null or c->>'email' is null then raise exception 'FAIL: no default contact -> %', c; end if;
  begin perform public.admin_set_contact('+9647700000000', 'x@x.org', 'بغداد', 'Baghdad'); raise exception 'FAIL: anon changed contact';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- a doctor and an admin without the authenticator code cannot change it
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000d1","aal":"aal1"}', true);
do $$ begin
  begin perform public.admin_set_contact('+9647700000000', 'x@x.org', 'بغداد', 'Baghdad'); raise exception 'FAIL: doctor changed contact';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}', true);
do $$ begin
  begin perform public.admin_set_contact('+9647700000000', 'x@x.org', 'بغداد', 'Baghdad'); raise exception 'FAIL: aal1 admin changed contact';
  exception when insufficient_privilege then null; end;
end $$;

-- an admin with the authenticator code changes it; bad input is refused
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}', true);
do $$ declare c json; begin
  perform public.admin_set_contact(' 07701112222 ', ' Info@AlFarabiUC.edu.iq ', 'جامعة الفارابي — بغداد', 'Al-Farabi University — Baghdad');
  c := public.get_site_contact();
  if c->>'phone' <> '07701112222' or c->>'email' <> 'info@alfarabiuc.edu.iq' or c->>'location_en' <> 'Al-Farabi University — Baghdad' then
    raise exception 'FAIL: saved -> %', c;
  end if;
  begin perform public.admin_set_contact('x', 'not-an-email', 'a', 'b'); raise exception 'FAIL: bad email accepted';
  exception when invalid_parameter_value then null; end;
  begin perform public.admin_set_contact(repeat('9', 40), 'a@b.co', 'a', 'b'); raise exception 'FAIL: long phone accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.audit_log where action = 'contact_update') then raise exception 'FAIL: not audited'; end if;
end $$;
rollback;
select 'site_settings.sql: all assertions passed' as result;
