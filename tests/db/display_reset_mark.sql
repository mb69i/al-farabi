-- Hall screen reset without deleting (owner, 22 Nov): the numbers count only arrivals after the
-- 'display_counts_since' time; the earlier check-ins stay in the database. Rolled back.
begin;
do $$
declare ev uuid := (select id from public.events where slug = 'alfarabi-conf-2026');
  before_n int := (select count(*) from public.guest_checkins);
  c json;
begin
  insert into public.guests (id, event_id, serial, full_name, name_script, phone, email, gender, guest_type, workplace, specialization, lang, created_at)
  values ('00000000-0000-0000-0000-0000000000e1', ev, 'ALF26-RST001', 'Before Reset', 'en', '+9647700000201', 'b1@test.local', 'male', 'visitor', 'w', 's', 'en', now() - interval '2 minutes'),
         ('00000000-0000-0000-0000-0000000000e2', ev, 'ALF26-RST002', 'After Reset', 'en', '+9647700000202', 'a2@test.local', 'female', 'visitor', 'w', 's', 'en', now());
  insert into public.guest_checkins (guest_id, day, at) values
    ('00000000-0000-0000-0000-0000000000e1', public.baghdad_today(), now() - interval '2 minutes'),
    ('00000000-0000-0000-0000-0000000000e2', public.baghdad_today(), now());
  insert into public.site_settings (key, value) values ('display_counts_since', to_jsonb(now() - interval '1 minute'))
  on conflict (key) do update set value = excluded.value;
  c := public.get_display_counts('alfarabi-conf-2026');
  if (c->>'present_today')::int <> 1 or (c->>'total')::int <> 1 or (c->>'female')::int <> 1 or (c->>'male')::int <> 0 then
    raise exception 'FAIL: should count only the arrival after the reset %', c;
  end if;
  if (select count(*) from public.guest_checkins) <> before_n + 2 then raise exception 'FAIL: records were removed'; end if;
  raise notice 'PASS display_reset_mark';
end $$;
rollback;
