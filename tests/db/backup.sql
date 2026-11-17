-- Read-only backup export for the two laptops, gated by a revocable token. Rolled back.
begin;

-- token for the test: only its SHA-256 is stored
insert into public.backup_tokens (label, token_hash)
values ('test-laptop', encode(extensions.digest('BACKUP-TEST-TOKEN-0123456789abcdefghijkl', 'sha256'), 'hex'));

do $$ begin
  if has_table_privilege('anon', 'public.backup_tokens', 'select') then raise exception 'FAIL: token table exposed'; end if;
end $$;

set local role anon;
do $$ declare b json; begin
  -- wrong / short / missing tokens are refused
  begin perform public.backup_export(null); raise exception 'FAIL: null token';
  exception when insufficient_privilege then null; end;
  begin perform public.backup_export('short'); raise exception 'FAIL: short token';
  exception when insufficient_privilege then null; end;
  begin perform public.backup_export('WRONG-TOKEN-0123456789abcdefghijklmnopq'); raise exception 'FAIL: wrong token';
  exception when insufficient_privilege then null; end;
  -- the right token returns every table the event needs
  b := public.backup_export('BACKUP-TEST-TOKEN-0123456789abcdefghijkl');
  if b->>'event' is null or json_typeof(b->'guests') <> 'array' or json_typeof(b->'researchers') <> 'array'
     or json_typeof(b->'checkins') <> 'array' or json_typeof(b->'signoffs') <> 'array' or b->>'exported_at' is null then
    raise exception 'FAIL: export shape -> %', left(b::text, 300);
  end if;
  if (select count(*) from json_array_elements(b->'researchers')) <> (select (public.get_display_counts('alfarabi-conf-2026')->>'researchers_total')::int) then
    raise exception 'FAIL: researcher count';
  end if;
end $$;
reset role;

-- every export is logged with the token label; a revoked token stops working
do $$ begin
  if (select count(*) from public.audit_log where action = 'backup_export' and target = 'test-laptop') <> 1 then
    raise exception 'FAIL: backup not audited';
  end if;
end $$;
update public.backup_tokens set revoked_at = now() where label = 'test-laptop';
set local role anon;
do $$ begin
  begin perform public.backup_export('BACKUP-TEST-TOKEN-0123456789abcdefghijkl'); raise exception 'FAIL: revoked token';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;
select 'backup.sql: all assertions passed' as result;
