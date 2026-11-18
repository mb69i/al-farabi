-- Certificates are sent straight after registration (owner, 18 Nov), and after a doctor's sign-off as before.
-- They are drawn on the owner's forma by the site's certificate function (api/certificate.mjs, Chromium),
-- so certificates no longer wait for a Pillow template; cards still do.

create or replace function public.delivery_initial_status(p_event_id uuid, p_kind text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not (case p_kind when 'card' then e.cards_enabled else e.certificates_enabled end) then 'disabled'
    when p_kind = 'card' and not exists (select 1 from public.templates t where t.event_id = e.id and t.kind = 'card')
      then 'waiting_template'
    else 'queued'
  end
  from public.events e where e.id = p_event_id
$$;

-- Every new guest gets one certificate job (a second-day check-in does not create a guest, so no duplicate).
create function public.guests_queue_certificate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.deliveries (event_id, kind, guest_id, to_email, lang, status)
  values (new.event_id, 'certificate', new.id, new.email, new.lang,
          public.delivery_initial_status(new.event_id, 'certificate'))
  on conflict do nothing;
  return null;
end $$;

create trigger guests_queue_certificate after insert on public.guests
  for each row execute function public.guests_queue_certificate();

-- What the certificate function needs for one delivery: issues the serial (idempotent) with the event's dates.
create function public.certificate_job(p_delivery_id uuid) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  d public.deliveries;
  e public.events;
  c public.certificates;
  v_serial text;
  v_org text;
begin
  select * into d from public.deliveries where id = p_delivery_id and kind = 'certificate';
  if d.id is null then
    return null;
  end if;
  select * into e from public.events where id = d.event_id;
  if d.guest_id is not null then
    v_serial := public.issue_certificate('attendee', d.guest_id, null, e.starts_on, e.ends_on);
    select workplace into v_org from public.guests where id = d.guest_id;
  else
    v_serial := public.issue_certificate('researcher', null, d.researcher_id, e.starts_on, e.ends_on);
    select institution into v_org from public.researchers where id = d.researcher_id;
  end if;
  select * into c from public.certificates where serial = v_serial;
  return json_build_object('event_id', d.event_id, 'serial', c.serial, 'name', c.name, 'org', coalesce(v_org, ''),
                           'role', c.role, 'date_from', c.date_from, 'date_to', c.date_to);
end $$;

revoke execute on function public.guests_queue_certificate() from public, anon, authenticated;
revoke execute on function public.certificate_job(uuid) from public, anon, authenticated;
grant execute on function public.certificate_job(uuid) to service_role;
