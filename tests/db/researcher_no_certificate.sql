-- Researchers get no emailed certificate (owner, 19 Nov): when they sign they get a card, and a printed
-- certificate after the conference. Signing queues nothing, and switching certificates on never releases
-- an old researcher certificate. Guests still get theirs. Rolled back.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000d9', 'doctor9@test.local', 'authenticated', 'authenticated');
insert into public.staff (user_id, email, role) values ('00000000-0000-0000-0000-0000000000d9', 'doctor9@test.local', 'doctor');
update public.events set certificates_enabled = true, registration_open = true where slug = 'alfarabi-conf-2026';
insert into public.researchers (id, event_id, name_ar, email, institution, research_title)
select '00000000-0000-0000-0000-00000000ab01', id, 'باحث تجريبي', 'r9@test.local', 'UoB', 'T'
from public.events where slug = 'alfarabi-conf-2026';
-- another researcher with an old certificate job, held
insert into public.researchers (id, event_id, name_ar, email, institution, research_title)
select '00000000-0000-0000-0000-00000000ab02', id, 'باحث قديم', 'r8@test.local', 'UoB', 'T'
from public.events where slug = 'alfarabi-conf-2026';
insert into public.deliveries (event_id, kind, researcher_id, to_email, lang, status)
select id, 'certificate', '00000000-0000-0000-0000-00000000ab02', 'r8@test.local', 'ar', 'disabled'
from public.events where slug = 'alfarabi-conf-2026';

create temp table pfx on commit drop as
select 'signatures/' || id || '/00000000-0000-0000-0000-00000000ab01/' as p from public.events where slug = 'alfarabi-conf-2026';
create temp table out1 (r json) on commit drop;
grant select on pfx to authenticated;
grant insert on out1 to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000d9","aal":"aal1"}', true);
insert into out1 select public.sign_off_researcher('00000000-0000-0000-0000-00000000ab01', p || 's.png', p || 's.json',
  repeat('a', 64), 'test') from pfx;
reset role;

do $$
declare ev uuid := (select id from public.events where slug = 'alfarabi-conf-2026'); res json;
begin
  if (select r->>'status' from out1) <> 'signed' then raise exception 'FAIL: sign -> %', (select r from out1); end if;
  if exists (select 1 from public.deliveries where researcher_id = '00000000-0000-0000-0000-00000000ab01') then
    raise exception 'FAIL: signing queued a certificate';
  end if;
  -- switching certificates on releases guest jobs only
  perform public.release_deliveries(ev, 'certificate');
  if (select status from public.deliveries where researcher_id = '00000000-0000-0000-0000-00000000ab02') <> 'disabled' then
    raise exception 'FAIL: researcher certificate released';
  end if;
  -- guests still get theirs
  res := public.register_guest('alfarabi-conf-2026', 'علي حسن كريم', '+9647700008891', 'g91@test.local', 'male', null,
                               'UoB', 'CS', 'ar', 'baghdad');
  if not exists (select 1 from public.deliveries d join public.guests g on g.id = d.guest_id
                  where g.serial = res->>'serial' and d.kind = 'certificate') then
    raise exception 'FAIL: guest certificate missing';
  end if;
end $$;
rollback;
select 'researcher_no_certificate.sql: all assertions passed' as result;
