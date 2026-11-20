-- Researcher search (owner, 21 Nov): by name, phone number, paper ID or email; each result carries its paper ID
-- and hall from the agenda. Authors with no email in the accepted-papers sheet can still sign (no email is queued).
-- Rolled back.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000d9', 'doctor9@test.local', 'authenticated', 'authenticated');
insert into public.staff (user_id, email, role) values ('00000000-0000-0000-0000-0000000000d9', 'doctor9@test.local', 'doctor');
update public.events set cards_enabled = true where slug = 'alfarabi-conf-2026';
insert into public.researchers (id, event_id, name_ar, email, phone, institution, research_title, paper_code, hall)
select '00000000-0000-0000-0000-00000000be01', id, 'سنان صلاح رشيد', 'sinan@test.local', '+9647701234567', 'جامعة بغداد',
       'التنظيم القانوني للذكاء الاصطناعي', 'ARCDT26-912', 'L_208'
from public.events where slug = 'alfarabi-conf-2026';
insert into public.researchers (id, event_id, name_ar, email, institution, research_title, paper_code, hall)
select '00000000-0000-0000-0000-00000000be02', id, 'سوسن حسن كاظم', null, 'جامعة النهرين', 'بحث بلا بريد', 'ARCDT26-982', 'L_204'
from public.events where slug = 'alfarabi-conf-2026';

create temp table q (label text, query text, want uuid) on commit drop;
insert into q values
  ('name', 'سنان صلاح', '00000000-0000-0000-0000-00000000be01'),
  ('email', 'SINAN@test', '00000000-0000-0000-0000-00000000be01'),
  ('paper id', 'ARCDT26-912', '00000000-0000-0000-0000-00000000be01'),
  ('paper number only', '912', '00000000-0000-0000-0000-00000000be01'),
  ('phone, local form', '07701234567', '00000000-0000-0000-0000-00000000be01'),
  ('phone with spaces', '0770 123 4567', '00000000-0000-0000-0000-00000000be01'),
  ('phone, international', '+964 770 123 4567', '00000000-0000-0000-0000-00000000be01'),
  ('phone, Arabic digits', '٠٧٧٠١٢٣٤٥٦٧', '00000000-0000-0000-0000-00000000be01'),
  ('author without email', 'سوسن', '00000000-0000-0000-0000-00000000be02');
create temp table found (label text, id uuid, paper_code text, hall text) on commit drop;
create temp table out1 (r json) on commit drop;
create temp table pfx on commit drop as
select 'signatures/' || id || '/00000000-0000-0000-0000-00000000be02/' as p from public.events where slug = 'alfarabi-conf-2026';
grant select on q, pfx to authenticated;
grant insert on found, out1 to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000d9","aal":"aal1"}', true);
insert into found
select q.label, s.id, s.paper_code, s.hall from q, lateral public.search_researchers('alfarabi-conf-2026', q.query) s;
insert into out1 select public.sign_off_researcher('00000000-0000-0000-0000-00000000be02', p || 's.png', p || 's.json',
  repeat('c', 64), 'test') from pfx;
reset role;

do $$
declare x record;
begin
  for x in select * from q loop
    if not exists (select 1 from found f where f.label = x.label and f.id = x.want) then
      raise exception 'FAIL: % (%) did not find the researcher', x.label, x.query;
    end if;
  end loop;
  if not exists (select 1 from found where label = 'paper id' and paper_code = 'ARCDT26-912' and hall = 'L_208') then
    raise exception 'FAIL: result has no paper ID / hall';
  end if;
  if (select r->>'status' from out1) <> 'signed' then raise exception 'FAIL: author without email could not sign %', (select r from out1); end if;
  if exists (select 1 from public.deliveries where researcher_id = '00000000-0000-0000-0000-00000000be02') then
    raise exception 'FAIL: an email was queued for an author with no email';
  end if;
  raise notice 'PASS researcher_search';
end $$;
rollback;
