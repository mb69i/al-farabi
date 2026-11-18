-- Backup devices managed from the dashboard (owner, 18 Nov): any laptop or PC can be made a backup store.
-- The owner adds a device (gets a one-time pairing code, 30 minutes), runs `python backup.py pair CODE` on
-- that PC, and can switch each device on/off or delete it. The PC makes its own secret token and sends only
-- its SHA-256, so no secret is ever shown on screen or typed into SQL. Owner-only (with the authenticator),
-- because a device receives a full copy of the data. Every change is in the audit log.

alter table public.backup_tokens
  alter column token_hash drop not null,                      -- a newly added device has no token until it pairs
  add column enabled boolean not null default true,
  add column last_seen_at timestamptz,
  add column pair_code_hash text,
  add column pair_expires_at timestamptz,
  add column created_by uuid;

create unique index backup_tokens_label_ci on public.backup_tokens (lower(label));

insert into public.rate_limits (name, max_hits, window_seconds) values ('backup_pair_ip', 10, 600)
on conflict (name) do nothing;

-- 8 letters from the serial alphabet (no 0/O/1/I), shown as XXXX-XXXX; compared without dash or case.
create function public.new_backup_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(8);
  out text := '';
begin
  for i in 0..7 loop
    if i = 4 then out := out || '-'; end if;
    out := out || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return out;
end $$;

create function public.backup_code_hash(p_code text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex')
$$;

create function public.admin_list_backup_devices() returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_role('owner');
  return coalesce((select json_agg(json_build_object(
      'id', b.id, 'label', b.label, 'enabled', b.enabled, 'paired', b.token_hash is not null,
      'pair_expires_at', case when b.pair_code_hash is not null then b.pair_expires_at end,
      'last_seen_at', b.last_seen_at, 'created_at', b.created_at) order by b.created_at)
    from public.backup_tokens b where b.revoked_at is null), '[]'::json);
end $$;

create function public.admin_add_backup_device(p_label text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_role('owner');
  v_label text := regexp_replace(btrim(coalesce(p_label, '')), '\s+', ' ', 'g');
  v_code text := public.new_backup_code();
  b public.backup_tokens;
begin
  if char_length(v_label) not between 2 and 40 then
    raise exception 'device name must be 2-40 characters' using errcode = '22023';
  end if;
  if exists (select 1 from public.backup_tokens where lower(label) = lower(v_label)) then
    raise exception 'a device with this name already exists' using errcode = '23505';
  end if;
  insert into public.backup_tokens (label, token_hash, enabled, pair_code_hash, pair_expires_at, created_by)
  values (v_label, null, true, public.backup_code_hash(v_code), now() + interval '30 minutes', v_uid)
  returning * into b;
  perform public.audit('backup_device_add', b.label, '{}'::jsonb);
  return json_build_object('id', b.id, 'label', b.label, 'code', v_code, 'expires_at', b.pair_expires_at);
end $$;

-- A fresh code for an existing device (code expired, or moving the backup to another PC).
create function public.admin_new_backup_code(p_id uuid) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_code text := public.new_backup_code();
  b public.backup_tokens;
begin
  perform public.require_role('owner');
  update public.backup_tokens set pair_code_hash = public.backup_code_hash(v_code), pair_expires_at = now() + interval '30 minutes'
   where id = p_id and revoked_at is null returning * into b;
  if b.id is null then raise exception 'no such device' using errcode = 'P0002'; end if;
  perform public.audit('backup_device_code', b.label, '{}'::jsonb);
  return json_build_object('id', b.id, 'label', b.label, 'code', v_code, 'expires_at', b.pair_expires_at);
end $$;

create function public.admin_set_backup_device(p_id uuid, p_enabled boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_label text;
begin
  perform public.require_role('owner');
  update public.backup_tokens set enabled = coalesce(p_enabled, false)
   where id = p_id and revoked_at is null returning label into v_label;
  if v_label is null then raise exception 'no such device' using errcode = 'P0002'; end if;
  perform public.audit('backup_device_set', v_label, jsonb_build_object('enabled', coalesce(p_enabled, false)));
end $$;

create function public.admin_delete_backup_device(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_label text;
begin
  perform public.require_role('owner');
  delete from public.backup_tokens where id = p_id returning label into v_label;
  if v_label is null then raise exception 'no such device' using errcode = 'P0002'; end if;
  perform public.audit('backup_device_delete', v_label, '{}'::jsonb);
end $$;

-- Called by the PC (anon): a valid, unexpired, unused code binds the PC's token fingerprint to the device.
create function public.backup_pair(p_code text, p_token_hash text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare b public.backup_tokens;
begin
  if not public.take_rate('backup_pair_ip', public.client_ip()) then
    raise exception 'too many attempts' using errcode = '42501';
  end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'bad token fingerprint' using errcode = '22023';
  end if;
  update public.backup_tokens
     set token_hash = p_token_hash, pair_code_hash = null, pair_expires_at = null, enabled = true
   where pair_code_hash = public.backup_code_hash(p_code) and pair_expires_at > now() and revoked_at is null
  returning * into b;
  if b.id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.audit_log (actor, action, target) values (null, 'backup_device_pair', b.label);
  return b.label;
end $$;

-- backup_export: a switched-off device is refused as "paused"; each good export records the time.
create or replace function public.backup_export(p_token text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  b public.backup_tokens;
  v_event public.events;
begin
  if p_token is null or char_length(p_token) < 32 then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into b from public.backup_tokens
   where revoked_at is null and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if b.id is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not b.enabled then
    raise exception 'paused by the owner' using errcode = '55000';
  end if;
  update public.backup_tokens set last_seen_at = now() where id = b.id;
  select * into v_event from public.events where slug = 'alfarabi-conf-2026';
  insert into public.audit_log (actor, action, target) values (null, 'backup_export', b.label);

  return json_build_object(
    'exported_at', now(),
    'event', to_json(v_event),
    'guests', coalesce((select json_agg(to_json(g) order by g.created_at)
                        from public.guests g where g.event_id = v_event.id), '[]'),
    'checkins', coalesce((select json_agg(json_build_object('serial', g.serial, 'day', c.day, 'at', c.at) order by c.at)
                          from public.guest_checkins c join public.guests g on g.id = c.guest_id
                          where g.event_id = v_event.id), '[]'),
    'researchers', coalesce((select json_agg(to_json(r) order by r.name_ar)
                             from public.researchers r where r.event_id = v_event.id), '[]'),
    'signoffs', coalesce((select json_agg(json_build_object(
                             'researcher_id', s.researcher_id, 'day', s.day, 'signed_at', s.signed_at,
                             'signature_path', s.signature_path, 'strokes_path', s.strokes_path,
                             'sig_sha256', s.sig_sha256, 'doctor_email', st.email, 'device', s.device) order by s.signed_at)
                          from public.researcher_signoffs s
                          join public.researchers r on r.id = s.researcher_id
                          left join public.staff st on st.user_id = s.doctor_id
                          where r.event_id = v_event.id), '[]'),
    'deliveries', coalesce((select json_agg(json_build_object(
                               'kind', d.kind, 'guest_id', d.guest_id, 'researcher_id', d.researcher_id,
                               'status', d.status, 'sent_at', d.sent_at, 'attempts', d.attempts) order by d.created_at)
                            from public.deliveries d where d.event_id = v_event.id), '[]'),
    -- certificates (item 8/9): so printed serials survive a restore
    'certificates', coalesce((select json_agg(json_build_object(
                                 'serial', c.serial, 'role', c.role, 'guest_id', c.guest_id, 'researcher_id', c.researcher_id,
                                 'name', c.name, 'date_from', c.date_from, 'date_to', c.date_to, 'created_at', c.created_at)
                                 order by c.created_at)
                              from public.certificates c where c.event_id = v_event.id), '[]'));
end $$;

revoke execute on function public.new_backup_code(), public.backup_code_hash(text) from public, anon, authenticated;
revoke execute on function public.admin_list_backup_devices(), public.admin_add_backup_device(text),
  public.admin_new_backup_code(uuid), public.admin_set_backup_device(uuid, boolean),
  public.admin_delete_backup_device(uuid) from public, anon;
grant execute on function public.admin_list_backup_devices(), public.admin_add_backup_device(text),
  public.admin_new_backup_code(uuid), public.admin_set_backup_device(uuid, boolean),
  public.admin_delete_backup_device(uuid) to authenticated;
revoke execute on function public.backup_pair(text, text) from public;
grant execute on function public.backup_pair(text, text) to anon, authenticated;
revoke execute on function public.backup_export(text) from public;
grant execute on function public.backup_export(text) to anon, authenticated;
