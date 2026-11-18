-- Task 5 tests: admin/owner functions, aal2 gate, audit log, staff management. Rolled back.
begin;
-- card-queue checks: registrations here should not also queue certificates (see cert_on_register.sql)
alter table public.guests disable trigger guests_queue_certificate;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'doctor@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000c1', 'new@test.local', 'authenticated', 'authenticated');
insert into public.staff (user_id, email, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'doctor@test.local', 'doctor'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', 'admin');

-- bootstrap_owner is not executable by anon or authenticated, and works once for postgres
do $$ begin
  if has_function_privilege('anon', 'public.bootstrap_owner(text)', 'execute')
     or has_function_privilege('authenticated', 'public.bootstrap_owner(text)', 'execute') then
    raise exception 'FAIL: bootstrap_owner exposed';
  end if;
  if public.bootstrap_owner('OWNER@test.local') <> 'ok' then raise exception 'FAIL: bootstrap'; end if;
  if public.bootstrap_owner('admin@test.local') = 'ok' then raise exception 'FAIL: second owner allowed'; end if;
  if (select role from public.staff where user_id = '00000000-0000-0000-0000-0000000000b1') <> 'owner' then raise exception 'FAIL: owner row'; end if;
end $$;

-- service_add_staff is service_role only
do $$ begin
  if has_function_privilege('authenticated', 'public.service_add_staff(uuid,text,text,text,uuid)', 'execute') then
    raise exception 'FAIL: service_add_staff exposed';
  end if;
  if not has_function_privilege('service_role', 'public.service_add_staff(uuid,text,text,text,uuid)', 'execute') then
    raise exception 'FAIL: service_role cannot add staff';
  end if;
end $$;

-- fixtures: open event, one guest with a disabled card, one researcher row
update public.events set registration_open = true where slug = 'alfarabi-conf-2026';
update public.events set certificates_enabled = false where slug = 'alfarabi-conf-2026'; -- card checks only
select public.register_guest('alfarabi-conf-2026', 'Ali Hasan', '+9647701234567', 'ali@x.org', 'male', 'visitor', 'UoB', 'CS', 'en');
create temp table g on commit drop as select id from public.guests limit 1;
grant select on g to authenticated;

-- doctor cannot call any admin_ function; admin at aal1 neither
create temp table calls(sql text) on commit drop;
insert into calls values
  ($q$select public.admin_overview('alfarabi-conf-2026')$q$),
  ($q$select public.admin_list_guests('alfarabi-conf-2026', '', 50, 0)$q$),
  ($q$select public.admin_update_guest((select id from g), '{"full_name":"X Y Z"}')$q$),
  ($q$select public.admin_delete_guest((select id from g))$q$),
  ($q$select public.admin_import_researchers('alfarabi-conf-2026', '[]')$q$),
  ($q$select public.admin_list_researchers('alfarabi-conf-2026', '', 50, 0)$q$),
  ($q$select public.admin_set_vip('guest', (select id from g), true)$q$),
  ($q$select public.admin_set_switches('alfarabi-conf-2026', true, true, true)$q$),
  ($q$select public.admin_list_deliveries('alfarabi-conf-2026', '', 50, 0)$q$),
  ($q$select public.admin_retry_delivery(gen_random_uuid())$q$),
  ($q$select public.admin_get_template('alfarabi-conf-2026', 'card')$q$),
  ($q$select public.admin_save_template('alfarabi-conf-2026', 'card', 'p', 1, 1, '{}')$q$),
  ($q$select public.admin_export('alfarabi-conf-2026')$q$);
grant select on calls to authenticated;
create temp table owner_calls(sql text) on commit drop;
insert into owner_calls values
  ($q$select public.owner_list_staff()$q$),
  ($q$select public.owner_set_staff('00000000-0000-0000-0000-0000000000d1', 'doctor', false)$q$),
  ($q$select public.owner_audit(50, 0)$q$);
grant select on owner_calls to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000d1","aal":"aal1"}', true);
do $$ declare c text; begin
  for c in select sql from calls union all select sql from owner_calls loop
    begin
      execute c;
      raise exception 'FAIL: doctor ran %', c;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
-- admin without aal2 is rejected
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal1"}', true);
do $$ declare c text; begin
  for c in select sql from calls loop
    begin
      execute c;
      raise exception 'FAIL: aal1 admin ran %', c;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
-- admin cannot call owner_ functions
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}', true);
do $$ declare c text; begin
  for c in select sql from owner_calls loop
    begin
      execute c;
      raise exception 'FAIL: admin ran %', c;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

-- admin_overview has counts, switches and delivery groups
do $$ declare o json := public.admin_overview('alfarabi-conf-2026'); begin
  if (o->>'total')::int <> 1 or o->'switches'->>'registration_open' <> 'true' or json_array_length(o->'deliveries') <> 1 then
    raise exception 'FAIL: overview -> %', o;
  end if;
end $$;

-- admin_list_guests searches and pages
do $$ declare p json; begin
  p := public.admin_list_guests('alfarabi-conf-2026', 'ali@', 50, 0);
  if (p->>'total')::int <> 1 or p->'rows'->0->>'serial' is null then raise exception 'FAIL: list -> %', p; end if;
  p := public.admin_list_guests('alfarabi-conf-2026', 'nobody', 50, 0);
  if (p->>'total')::int <> 0 then raise exception 'FAIL: search -> %', p; end if;
end $$;

-- admin_update_guest ignores unknown keys
do $$ declare before text := (public.admin_list_guests('alfarabi-conf-2026', '', 1, 0)->'rows'->0->>'serial'); r json; begin
  r := public.admin_update_guest((select id from g), '{"full_name":"Ali H. Hasan","serial":"HACKED","is_vip":true}');
  if r->>'full_name' <> 'Ali H. Hasan' or r->>'serial' <> before or (r->>'is_vip')::boolean is not true then
    raise exception 'FAIL: update -> %', r;
  end if;
end $$;

-- admin_import_researchers reports bad email row and inserts the rest; re-import updates
do $$ declare r json; begin
  r := public.admin_import_researchers('alfarabi-conf-2026', '[
    {"name_ar":"أحمد علي","name_en":"Ahmed Ali","email":"Ahmed@Uni.edu","phone":"+9647701112222","gender":"male","institution":"UoB","research_title":"T1"},
    {"name_ar":"خطأ","email":"not-an-email","research_title":"T2"},
    {"name_ar":"سارة","email":"sara@uni.edu","research_title":"T3"}]');
  if (r->>'inserted')::int <> 2 or (r->>'updated')::int <> 0 or json_array_length(r->'errors') <> 1
     or (r->'errors'->0->>'row')::int <> 2 or r->'errors'->0->>'message' <> 'email' then
    raise exception 'FAIL: import -> %', r;
  end if;
  r := public.admin_import_researchers('alfarabi-conf-2026', '[{"name_ar":"أحمد علي محمد","email":"ahmed@uni.edu","research_title":"T1"}]');
  if (r->>'updated')::int <> 1 or (r->>'inserted')::int <> 0 then raise exception 'FAIL: re-import -> %', r; end if;
  if (public.admin_list_researchers('alfarabi-conf-2026', 'محمد', 50, 0)->>'total')::int <> 1 then raise exception 'FAIL: updated name not found'; end if;
end $$;

-- admin_set_switches releases disabled cards (a card template exists)
do $$ begin
  perform public.admin_save_template('alfarabi-conf-2026', 'card', 'alfarabi-conf-2026/card/forma.png', 1600, 1000, '{"fields":{}}');
  if (public.admin_list_deliveries('alfarabi-conf-2026', '', 50, 0)->'rows'->0->>'status') <> 'disabled' then
    raise exception 'FAIL: expected disabled before switch';
  end if;
  perform public.admin_set_switches('alfarabi-conf-2026', true, true, false);
  if (public.admin_list_deliveries('alfarabi-conf-2026', '', 50, 0)->'rows'->0->>'status') <> 'queued' then
    raise exception 'FAIL: card not released by switch';
  end if;
end $$;
reset role;

-- release moves waiting_template to queued after template saved
delete from public.templates;
update public.deliveries set status = 'waiting_template';
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}', true);
do $$ declare t json; begin
  if public.admin_get_template('alfarabi-conf-2026', 'card') is not null then raise exception 'FAIL: template should be gone'; end if;
  perform public.admin_save_template('alfarabi-conf-2026', 'card', 'alfarabi-conf-2026/card/forma.png', 1600, 1000, '{"fields":{"a":1}}');
  t := public.admin_get_template('alfarabi-conf-2026', 'card');
  if t->>'forma_path' <> 'alfarabi-conf-2026/card/forma.png' or (t->>'width')::int <> 1600 then raise exception 'FAIL: get_template -> %', t; end if;
  if (public.admin_list_deliveries('alfarabi-conf-2026', '', 50, 0)->'rows'->0->>'status') <> 'queued' then
    raise exception 'FAIL: template save did not release';
  end if;
end $$;

-- admin_list_deliveries includes the person's name; retry re-queues
do $$ declare d json := public.admin_list_deliveries('alfarabi-conf-2026', 'queued', 50, 0); begin
  if d->'rows'->0->>'name' <> 'Ali H. Hasan' then raise exception 'FAIL: delivery name -> %', d; end if;
end $$;
reset role;
update public.deliveries set status = 'failed', attempts = 5, last_error = 'x';
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}', true);
do $$ begin
  perform public.admin_retry_delivery((select (public.admin_list_deliveries('alfarabi-conf-2026', 'failed', 1, 0)->'rows'->0->>'id')::uuid));
  if (public.admin_list_deliveries('alfarabi-conf-2026', 'queued', 50, 0)->>'total')::int <> 1 then raise exception 'FAIL: retry'; end if;
end $$;

-- admin_set_vip and admin_export
do $$ declare e json; begin
  perform public.admin_set_vip('guest', (select id from g), false);
  e := public.admin_export('alfarabi-conf-2026');
  if json_array_length(e->'guests') <> 1 or json_array_length(e->'researchers') <> 2 or json_array_length(e->'checkins') <> 1 then
    raise exception 'FAIL: export -> %', e;
  end if;
  if (e->'guests'->0->>'is_vip')::boolean then raise exception 'FAIL: vip not cleared'; end if;
end $$;

-- admin_delete_guest removes the guest and its jobs
do $$ begin
  perform public.admin_delete_guest((select id from g));
  if (public.admin_list_guests('alfarabi-conf-2026', '', 50, 0)->>'total')::int <> 0 then raise exception 'FAIL: delete'; end if;
end $$;
reset role;

-- every admin write adds an audit_log row
do $$ declare n int := (select count(*) from public.audit_log); begin
  if (select count(*) from public.audit_log where actor = '00000000-0000-0000-0000-0000000000a1') < 9 then
    raise exception 'FAIL: audit rows %', (select array_agg(action) from public.audit_log);
  end if;
end $$;

-- owner functions
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000b1","aal":"aal2"}', true);
do $$ declare s json; a json; begin
  s := public.owner_list_staff();
  if json_array_length(s) <> 3 then raise exception 'FAIL: staff list -> %', s; end if;
  perform public.owner_set_staff('00000000-0000-0000-0000-0000000000d1', 'doctor', false);
  -- owner cannot deactivate self
  begin
    perform public.owner_set_staff('00000000-0000-0000-0000-0000000000b1', 'owner', false);
    raise exception 'FAIL: owner deactivated self';
  exception when invalid_parameter_value then null;
  end;
  -- nobody can be promoted to owner
  begin
    perform public.owner_set_staff('00000000-0000-0000-0000-0000000000a1', 'owner', true);
    raise exception 'FAIL: promoted to owner';
  exception when invalid_parameter_value then null;
  end;
  a := public.owner_audit(50, 0);
  if (a->>'total')::int < 10 or a->'rows'->0->>'actor_email' is null then raise exception 'FAIL: audit -> %', a; end if;
end $$;
reset role;
do $$ begin
  if (select active from public.staff where user_id = '00000000-0000-0000-0000-0000000000d1') then raise exception 'FAIL: doctor still active'; end if;
end $$;

-- service_add_staff (as service_role) adds an admin and writes audit
set local role service_role;
select public.service_add_staff('00000000-0000-0000-0000-0000000000c1', 'NEW@test.local', 'admin', 'New Admin', '00000000-0000-0000-0000-0000000000b1');
reset role;
do $$ begin
  if (select role from public.staff where user_id = '00000000-0000-0000-0000-0000000000c1') <> 'admin' then raise exception 'FAIL: service_add_staff'; end if;
  if (select email from public.staff where user_id = '00000000-0000-0000-0000-0000000000c1') <> 'new@test.local' then raise exception 'FAIL: email lower'; end if;
  if not exists (select 1 from public.audit_log where action = 'staff_invite' and actor = '00000000-0000-0000-0000-0000000000b1') then
    raise exception 'FAIL: invite audit';
  end if;
end $$;

rollback;
select 'admin.sql: all assertions passed' as result;
