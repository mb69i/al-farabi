-- Researcher attendance card (owner, 20 Nov): signing queues a card (no design needed); researchers still get
-- no email certificate; guests still get no card; switching cards on releases held researcher cards. Rolled back.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000d8', 'doctor8@test.local', 'authenticated', 'authenticated');
insert into public.staff (user_id, email, role) values ('00000000-0000-0000-0000-0000000000d8', 'doctor8@test.local', 'doctor');
update public.events set cards_enabled = true, certificates_enabled = true, registration_open = true where slug = 'alfarabi-conf-2026';
delete from public.templates t using public.events e where e.id = t.event_id and e.slug = 'alfarabi-conf-2026' and t.kind = 'card';
insert into public.researchers (id, event_id, name_ar, name_en, email, institution, research_title)
select '00000000-0000-0000-0000-00000000ac01', id, 'ليلى حسن تجريبي', 'Layla Hassan', 'r7@test.local', 'AUB', 'Trust in AI'
from public.events where slug = 'alfarabi-conf-2026';

create temp table pfx on commit drop as
select 'signatures/' || id || '/00000000-0000-0000-0000-00000000ac01/' as p from public.events where slug = 'alfarabi-conf-2026';
create temp table out1 (r json) on commit drop;
grant select on pfx to authenticated;
grant insert on out1 to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000d8","aal":"aal1"}', true);
insert into out1 select public.sign_off_researcher('00000000-0000-0000-0000-00000000ac01', p || 's.png', p || 's.json',
  repeat('b', 64), 'test') from pfx;
reset role;

do $$
declare d public.deliveries; c json; j json; res json; ev uuid := (select id from public.events where slug = 'alfarabi-conf-2026');
begin
  if (select r->>'status' from out1) <> 'signed' then raise exception 'FAIL: sign -> %', (select r from out1); end if;
  select * into d from public.deliveries where researcher_id = '00000000-0000-0000-0000-00000000ac01' and kind = 'card';
  if d.id is null or d.status <> 'queued' or d.to_email <> 'r7@test.local' then raise exception 'FAIL: no queued card %', d; end if;
  if exists (select 1 from public.deliveries where researcher_id = '00000000-0000-0000-0000-00000000ac01' and kind = 'certificate') then
    raise exception 'FAIL: researcher got an email certificate';
  end if;

  -- what the sender and the drawing function see
  c := public.delivery_context(d.id);
  if c->>'role' <> 'researcher' or c->'values'->>'research_title' <> 'Trust in AI' then raise exception 'FAIL: context %', c; end if;
  j := public.card_job(d.id);
  if j->>'name' <> 'ليلى حسن تجريبي' or j->>'org' <> 'AUB' or j->>'title' <> 'Trust in AI'
     or j->>'date_from' <> '2026-11-21' or j->>'date_to' <> '2026-11-22' then raise exception 'FAIL: card_job %', j; end if;
  if public.card_job((select id from public.deliveries where kind = 'certificate' and guest_id is not null limit 1)) is not null then
    raise exception 'FAIL: card_job answered for a guest certificate';
  end if;

  -- cards switched off: a new signature holds the card; switching on releases it (no design needed)
  update public.events set cards_enabled = false where id = ev;
  delete from public.deliveries where id = d.id;
  delete from public.researcher_signoffs where researcher_id = '00000000-0000-0000-0000-00000000ac01';
  insert into public.deliveries (event_id, kind, researcher_id, to_email, lang, status)
  values (ev, 'card', '00000000-0000-0000-0000-00000000ac01', 'r7@test.local', 'en', public.researcher_card_status(ev));
  if (select status from public.deliveries where researcher_id = '00000000-0000-0000-0000-00000000ac01' and kind = 'card') <> 'disabled' then
    raise exception 'FAIL: card not held while cards are off';
  end if;
  update public.events set cards_enabled = true where id = ev;
  perform public.release_deliveries(ev, 'card');
  if (select status from public.deliveries where researcher_id = '00000000-0000-0000-0000-00000000ac01' and kind = 'card') <> 'queued' then
    raise exception 'FAIL: held researcher card not released';
  end if;

  -- guests: certificate yes, card never sent (no design)
  res := public.register_guest('alfarabi-conf-2026', 'علي حسن كريم', '+9647700008871', 'g71@test.local', 'male', null,
                               'UoB', 'CS', 'ar', 'baghdad');
  if (select d2.status from public.deliveries d2 join public.guests g on g.id = d2.guest_id where g.serial = res->>'serial' and d2.kind = 'card')
     = 'queued' then raise exception 'FAIL: a guest card would be sent'; end if;
  perform public.release_deliveries(ev, 'card');
  if exists (select 1 from public.deliveries d2 join public.guests g on g.id = d2.guest_id where g.serial = res->>'serial'
             and d2.kind = 'card' and d2.status = 'queued') then raise exception 'FAIL: guest card released'; end if;
  if not exists (select 1 from public.deliveries d2 join public.guests g on g.id = d2.guest_id where g.serial = res->>'serial'
                 and d2.kind = 'certificate' and d2.status = 'queued') then raise exception 'FAIL: guest certificate missing'; end if;
end $$;

do $$ begin
  if has_function_privilege('anon', 'public.card_job(uuid)', 'execute') then raise exception 'FAIL: public can read card_job'; end if;
end $$;
rollback;
select 'researcher_card.sql: all assertions passed' as result;
