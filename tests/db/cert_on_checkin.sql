-- Someone registered before certificates were sent on registration (17 Nov) gets their certificate the next time
-- they check in. Nobody gets a second one. Rolled back.
begin;
update public.events set registration_open = true, certificates_enabled = true where slug = 'alfarabi-conf-2026';
do $$
declare
  ev uuid := (select id from public.events where slug = 'alfarabi-conf-2026');
  gid uuid; res json;
begin
  -- an "old" guest: in the table, checked in yesterday, no certificate job
  alter table public.guests disable trigger guests_queue_certificate;
  insert into public.guests (event_id, serial, full_name, name_script, phone, email, gender, guest_type, workplace, specialization, lang)
  values (ev, 'ALF26-OLDG1X', 'ضيف قديم جدا', 'ar', '+9647700009911', 'old-guest@test.local', 'male', null, 'UoB', 'CS', 'ar')
  returning id into gid;
  alter table public.guests enable trigger guests_queue_certificate;
  alter table public.guest_checkins disable trigger checkins_queue_certificate; -- yesterday was before the trigger existed
  insert into public.guest_checkins (guest_id, day) values (gid, public.baghdad_today() - 1);
  alter table public.guest_checkins enable trigger checkins_queue_certificate;
  if exists (select 1 from public.deliveries where guest_id = gid and kind = 'certificate') then raise exception 'FAIL: setup'; end if;

  -- comes back today ("already registered")
  res := public.register_guest('alfarabi-conf-2026', 'ضيف قديم جدا', '+9647700009911', 'old-guest@test.local', 'male', null, 'UoB', 'CS', 'ar');
  if res->>'status' <> 'already_registered' then raise exception 'FAIL: register -> %', res; end if;
  if (select count(*) from public.deliveries where guest_id = gid and kind = 'certificate' and status = 'queued') <> 1 then
    raise exception 'FAIL: no certificate queued for a returning guest';
  end if;

  -- again the same day, and a check-in on another day: still exactly one
  res := public.register_guest('alfarabi-conf-2026', 'ضيف قديم جدا', '+9647700009911', 'old-guest@test.local', 'male', null, 'UoB', 'CS', 'ar');
  insert into public.guest_checkins (guest_id, day) values (gid, public.baghdad_today() + 1);
  if (select count(*) from public.deliveries where guest_id = gid and kind = 'certificate') <> 1 then
    raise exception 'FAIL: duplicate certificate';
  end if;
end $$;
rollback;
select 'cert_on_checkin.sql: all assertions passed' as result;
