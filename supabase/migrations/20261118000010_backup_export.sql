-- Read-only backup export for the backup laptops (scripts/backup.py).
-- Each laptop has its own random token; only its SHA-256 is stored. Revoke one with:
--   update public.backup_tokens set revoked_at = now() where label = 'laptop-1';
create table public.backup_tokens (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  token_hash text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
alter table public.backup_tokens enable row level security;
revoke all on public.backup_tokens from anon, authenticated;

create function public.backup_export(p_token text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_label text;
  v_event public.events;
begin
  if p_token is null or char_length(p_token) < 32 then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select label into v_label from public.backup_tokens
   where revoked_at is null and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if v_label is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_event from public.events where slug = 'alfarabi-conf-2026';
  insert into public.audit_log (actor, action, target) values (null, 'backup_export', v_label);

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
                            from public.deliveries d where d.event_id = v_event.id), '[]'));
end $$;

revoke execute on function public.backup_export(text) from public;
grant execute on function public.backup_export(text) to anon, authenticated;
