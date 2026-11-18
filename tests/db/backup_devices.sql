-- Backup devices managed from the dashboard: the owner adds a device (one-time pairing code), the PC pairs
-- itself with that code, and the owner can switch it on/off or delete it. Rolled back.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000b1', 'owner@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', 'admin@test.local', 'authenticated', 'authenticated');
insert into public.staff (user_id, email, role) values
  ('00000000-0000-0000-0000-0000000000b1', 'owner@test.local', 'owner'),
  ('00000000-0000-0000-0000-0000000000b2', 'admin@test.local', 'admin');
create temp table t (k text primary key, v text) on commit drop;
grant all on t to anon, authenticated;

-- strangers, admins, and an owner without the authenticator code cannot manage devices
set local role anon;
do $$ begin
  begin perform public.admin_add_backup_device('x'); raise exception 'FAIL: anon added a device';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000b2","aal":"aal2"}', true);
do $$ begin
  begin perform public.admin_add_backup_device('x'); raise exception 'FAIL: admin added a device';
  exception when insufficient_privilege then null; end;
  begin perform public.admin_list_backup_devices(); raise exception 'FAIL: admin listed devices';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000b1","aal":"aal1"}', true);
do $$ begin
  begin perform public.admin_add_backup_device('x'); raise exception 'FAIL: aal1 owner added a device';
  exception when insufficient_privilege then null; end;
end $$;

-- the owner adds a device and gets a one-time code; names must be sensible and unique
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000b1","aal":"aal2"}', true);
do $$ declare r json; l json; d json; begin
  r := public.admin_add_backup_device('  Laptop   B  ');
  if r->>'label' <> 'Laptop B' or r->>'code' !~ '^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$'
     or (r->>'expires_at')::timestamptz not between now() + interval '29 minutes' and now() + interval '31 minutes' then
    raise exception 'FAIL: add -> %', r;
  end if;
  insert into t values ('id', r->>'id'), ('code', r->>'code');
  l := public.admin_list_backup_devices();
  select x into d from json_array_elements(l) x where x->>'label' = 'Laptop B';
  if d is null or (d->>'enabled')::boolean is not true or (d->>'paired')::boolean is not false or d::jsonb ? 'token_hash' then
    raise exception 'FAIL: list -> %', l;
  end if;
  begin perform public.admin_add_backup_device('laptop b'); raise exception 'FAIL: duplicate name accepted';
  exception when unique_violation then null; end;
  begin perform public.admin_add_backup_device(' '); raise exception 'FAIL: empty name accepted';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;

-- the PC pairs itself with the code (as anon), sending only its token's fingerprint; the code works once
set local role anon;
do $$ declare code text := (select v from t where k = 'code'); h text := encode(extensions.digest('tok-B-0123456789-0123456789-0123456789', 'sha256'), 'hex');
begin
  begin perform public.backup_pair('ZZZZ-ZZZZ', h); raise exception 'FAIL: wrong code accepted';
  exception when insufficient_privilege then null; end;
  begin perform public.backup_pair(code, 'not-a-hash'); raise exception 'FAIL: bad fingerprint accepted';
  exception when invalid_parameter_value then null; end;
  if public.backup_pair(lower(replace(code, '-', ' ')), h) <> 'Laptop B' then raise exception 'FAIL: pair'; end if;
  begin perform public.backup_pair(code, h); raise exception 'FAIL: code reused';
  exception when insufficient_privilege then null; end;
  -- the paired PC can take backups, and its last backup time is recorded
  if (public.backup_export('tok-B-0123456789-0123456789-0123456789'))->>'exported_at' is null then raise exception 'FAIL: export'; end if;
end $$;
reset role;
do $$ begin
  if (select last_seen_at from public.backup_tokens where label = 'Laptop B') is null then raise exception 'FAIL: last_seen_at'; end if;
end $$;

-- switched off: the database refuses it as "paused"; switched on again: it works
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000b1","aal":"aal2"}', true);
do $$ begin perform public.admin_set_backup_device((select v::uuid from t where k = 'id'), false); end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.backup_export('tok-B-0123456789-0123456789-0123456789'); raise exception 'FAIL: paused device exported';
  exception when object_not_in_prerequisite_state then null; end;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000b1","aal":"aal2"}', true);
do $$ declare r json; begin
  perform public.admin_set_backup_device((select v::uuid from t where k = 'id'), true);
  -- a new code re-pairs the device (e.g. a new PC); the old token stops working once the new one pairs
  r := public.admin_new_backup_code((select v::uuid from t where k = 'id'));
  update t set v = r->>'code' where k = 'code';
end $$;
reset role;
set local role anon;
do $$ begin
  perform public.backup_pair((select v from t where k = 'code'), encode(extensions.digest('tok-B2-0123456789-0123456789-0123456789', 'sha256'), 'hex'));
  begin perform public.backup_export('tok-B-0123456789-0123456789-0123456789'); raise exception 'FAIL: old token still works';
  exception when insufficient_privilege then null; end;
  perform public.backup_export('tok-B2-0123456789-0123456789-0123456789');
end $$;
reset role;

-- an expired code is refused
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000b1","aal":"aal2"}', true);
do $$ declare r json; begin
  r := public.admin_add_backup_device('Laptop C');
  insert into t values ('code_c', r->>'code');
end $$;
reset role;
update public.backup_tokens set pair_expires_at = now() - interval '1 minute' where label = 'Laptop C';
set local role anon;
do $$ begin
  begin perform public.backup_pair((select v from t where k = 'code_c'), repeat('a', 64)); raise exception 'FAIL: expired code accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- delete: gone from the list, and its token no longer works
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000b1","aal":"aal2"}', true);
do $$ begin
  perform public.admin_delete_backup_device((select v::uuid from t where k = 'id'));
  if exists (select 1 from json_array_elements(public.admin_list_backup_devices()) x where x->>'label' = 'Laptop B') then
    raise exception 'FAIL: still listed';
  end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.backup_export('tok-B2-0123456789-0123456789-0123456789'); raise exception 'FAIL: deleted device exported';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.audit_log where action in ('backup_device_add', 'backup_device_set', 'backup_device_code', 'backup_device_delete')) < 4 then
    raise exception 'FAIL: not audited';
  end if;
  if not has_function_privilege('anon', 'public.backup_pair(text, text)', 'execute')
     or has_function_privilege('anon', 'public.admin_add_backup_device(text)', 'execute')
     or has_function_privilege('anon', 'public.admin_delete_backup_device(uuid)', 'execute') then
    raise exception 'FAIL: grants';
  end if;
end $$;
rollback;
select 'backup_devices.sql: all assertions passed' as result;
