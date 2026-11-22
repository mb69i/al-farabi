-- Hall screen counts today only (owner, 22 Nov: "reset them all"): registered = new registrations attending today,
-- present = everyone attending today, male + female = present; yesterday's records stay but are not counted.
-- Rolled back.
begin;
do $$
declare ev uuid := (select id from public.events where slug = 'alfarabi-conf-2026');
  c0 json := public.get_display_counts('alfarabi-conf-2026');
  c json;
begin
  insert into public.guests (id, event_id, serial, full_name, name_script, phone, email, gender, guest_type, workplace, specialization, lang, created_at)
  values ('00000000-0000-0000-0000-0000000000f1', ev, 'ALF26-TDY001', 'Old Guest', 'en', '+9647700000101', 'old1@test.local', 'male', 'visitor', 'w', 's', 'en', now() - interval '1 day'),
         ('00000000-0000-0000-0000-0000000000f2', ev, 'ALF26-TDY002', 'New Guest', 'en', '+9647700000102', 'new2@test.local', 'female', 'visitor', 'w', 's', 'en', now()),
         ('00000000-0000-0000-0000-0000000000f3', ev, 'ALF26-TDY003', 'Yesterday Only', 'en', '+9647700000103', 'y3@test.local', 'male', 'visitor', 'w', 's', 'en', now() - interval '1 day');
  insert into public.guest_checkins (guest_id, day) values
    ('00000000-0000-0000-0000-0000000000f1', public.baghdad_today()),
    ('00000000-0000-0000-0000-0000000000f2', public.baghdad_today()),
    ('00000000-0000-0000-0000-0000000000f3', public.baghdad_today() - 1);
  c := public.get_display_counts('alfarabi-conf-2026');
  if (c->>'present_today')::int - (c0->>'present_today')::int <> 2 then raise exception 'FAIL: present %', c; end if;
  if (c->>'total')::int - (c0->>'total')::int <> 1 then raise exception 'FAIL: registered today should count only the new guest %', c; end if;
  if (c->>'male')::int - (c0->>'male')::int <> 1 or (c->>'female')::int - (c0->>'female')::int <> 1 then
    raise exception 'FAIL: male/female should count today''s attendees %', c;
  end if;
  if (c->>'male')::int + (c->>'female')::int <> (c->>'present_today')::int then
    raise exception 'FAIL: male + female <> present today %', c;
  end if;
  raise notice 'PASS display_today';
end $$;
rollback;
