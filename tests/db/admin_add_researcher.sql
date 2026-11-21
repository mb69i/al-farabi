-- Admins add a researcher by hand (owner, 21 Nov): paper ID, hall and phone stored, found by the signing-desk
-- search; email optional; a doctor cannot add. Rolled back.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a7', 'admin7@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000d7', 'doctor7@test.local', 'authenticated', 'authenticated');
insert into public.staff (user_id, email, role) values
  ('00000000-0000-0000-0000-0000000000a7', 'admin7@test.local', 'admin'),
  ('00000000-0000-0000-0000-0000000000d7', 'doctor7@test.local', 'doctor');
create temp table out1 (r json) on commit drop;
create temp table found (id uuid) on commit drop;
create temp table denied (ok boolean) on commit drop;
grant insert on out1, found, denied to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a7","aal":"aal2"}', true);
insert into out1 select public.admin_add_researcher('alfarabi-conf-2026', jsonb_build_object(
  'name_ar', ' باحث مضاف يدويا ', 'research_title', 'بحث يدوي', 'paper_code', 'ARCDT26-777', 'hall', 'L_301',
  'phone', '+9647709998887', 'email', null, 'institution', 'جامعة الفارابي'));
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000d7","aal":"aal1"}', true);
insert into found select s.id from public.search_researchers('alfarabi-conf-2026', 'ARCDT26-777') s;
do $$ begin
  perform public.admin_add_researcher('alfarabi-conf-2026', '{"name_ar":"x","research_title":"y"}');
  insert into denied values (false);
exception when others then insert into denied values (true);
end $$;
reset role;

do $$
declare v_id uuid := ((select r from out1)->>'id')::uuid;
begin
  if v_id is null then raise exception 'FAIL: no id returned %', (select r from out1); end if;
  if not exists (select 1 from public.researchers where id = v_id and name_ar = 'باحث مضاف يدويا'
                 and paper_code = 'ARCDT26-777' and hall = 'L_301' and email is null and phone = '+9647709998887') then
    raise exception 'FAIL: researcher not stored as typed';
  end if;
  if not exists (select 1 from found where id = v_id) then raise exception 'FAIL: signing desk cannot find it'; end if;
  if not (select ok from denied) then raise exception 'FAIL: a doctor could add a researcher'; end if;
  raise notice 'PASS admin_add_researcher';
end $$;
rollback;
