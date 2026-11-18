-- Certificates go out straight after registration (and after a doctor's sign-off), drawn by the site's
-- certificate function; no Pillow template is needed for certificates any more. Rolled back.
-- (Queued rows also wake the sender through pg_net, but that request is rolled back with everything else.)
begin;
update public.events set registration_open = true, cards_enabled = false, certificates_enabled = true
 where slug = 'alfarabi-conf-2026';
delete from public.templates where kind = 'certificate';

do $$
declare
  ev public.events := (select e from public.events e where slug = 'alfarabi-conf-2026');
  res json; gid uuid; d public.deliveries; j json; j2 json; rid uuid;
begin
  -- registering queues a certificate at once (cards stay off)
  res := public.register_guest('alfarabi-conf-2026', 'ضيف الشهادة', '+9647700001234', 'cert-reg@test.local',
                               'female', 'visitor', 'جامعة بغداد', 'CS', 'ar');
  if res->>'status' <> 'created' then raise exception 'FAIL: register -> %', res; end if;
  select id into gid from public.guests where email = 'cert-reg@test.local';
  select * into d from public.deliveries where guest_id = gid and kind = 'certificate';
  if d.id is null or d.status <> 'queued' or d.to_email <> 'cert-reg@test.local' or d.lang <> 'ar' then
    raise exception 'FAIL: certificate not queued -> %', row_to_json(d);
  end if;
  if (select status from public.deliveries where guest_id = gid and kind = 'card') <> 'disabled' then
    raise exception 'FAIL: card should stay off';
  end if;

  -- coming back the next day does not queue a second certificate
  res := public.register_guest('alfarabi-conf-2026', 'ضيف الشهادة', '+9647700001234', 'cert-reg@test.local',
                               'female', 'visitor', 'جامعة بغداد', 'CS', 'ar');
  if (select count(*) from public.deliveries where guest_id = gid and kind = 'certificate') <> 1 then
    raise exception 'FAIL: duplicate certificate';
  end if;

  -- the drawing job issues the real serial once, with the event dates and the workplace
  j := public.certificate_job(d.id);
  if j->>'serial' !~ '^ALF26-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$' or j->>'name' <> 'ضيف الشهادة' or j->>'org' <> 'جامعة بغداد'
     or j->>'role' <> 'attendee' or j->>'date_from' <> ev.starts_on::text or j->>'date_to' <> ev.ends_on::text
     or j->>'event_id' <> ev.id::text then
    raise exception 'FAIL: job -> %', j;
  end if;
  j2 := public.certificate_job(d.id);
  if j2->>'serial' <> j->>'serial' then raise exception 'FAIL: serial changed on retry'; end if;
  if (public.verify_certificate(j->>'serial'))->>'status' <> 'valid' then raise exception 'FAIL: not verifiable'; end if;
  if public.certificate_job(gen_random_uuid()) is not null then raise exception 'FAIL: unknown delivery'; end if;

  -- with certificates switched off nothing is queued
  update public.events set certificates_enabled = false where id = ev.id;
  res := public.register_guest('alfarabi-conf-2026', 'ضيف ثان', '+9647700005678', 'cert-off@test.local',
                               'male', 'visitor', 'UoB', 'CS', 'en');
  if (select d2.status from public.deliveries d2 join public.guests g on g.id = d2.guest_id
      where g.email = 'cert-off@test.local' and d2.kind = 'certificate') <> 'disabled' then
    raise exception 'FAIL: switched-off certificate not disabled';
  end if;
  update public.events set certificates_enabled = true where id = ev.id;

  -- researchers: queued without a template too, and the job uses the institution
  insert into public.researchers (event_id, name_ar, email, research_title, institution)
  values (ev.id, 'باحث الشهادة', 'cert-res@test.local', 'عنوان', 'الجامعة التكنولوجية') returning id into rid;
  if public.delivery_initial_status(ev.id, 'certificate') <> 'queued' then raise exception 'FAIL: researcher status'; end if;
  insert into public.deliveries (event_id, kind, researcher_id, to_email, lang, status)
  values (ev.id, 'certificate', rid, 'cert-res@test.local', 'ar', 'disabled') returning * into d;
  j := public.certificate_job(d.id);
  if j->>'role' <> 'researcher' or j->>'name' <> 'باحث الشهادة' or j->>'org' <> 'الجامعة التكنولوجية' then
    raise exception 'FAIL: researcher job -> %', j;
  end if;

  -- cards still wait for their design
  if public.delivery_initial_status(ev.id, 'card') <> 'disabled' then raise exception 'FAIL: card status'; end if;

  if has_function_privilege('anon', 'public.certificate_job(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.certificate_job(uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.certificate_job(uuid)', 'execute') then
    raise exception 'FAIL: certificate_job grants';
  end if;
end $$;
rollback;
select 'cert_on_register.sql: all assertions passed' as result;
