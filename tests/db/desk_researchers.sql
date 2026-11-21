-- The signing desk loads every researcher once (owner, 21 Nov: search felt slow): names, paper ID, hall and a
-- search key without phone or email; doctors may load it, guests may not. Rolled back.
begin;
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000d8', 'doctor8@test.local', 'authenticated', 'authenticated');
insert into public.staff (user_id, email, role) values ('00000000-0000-0000-0000-0000000000d8', 'doctor8@test.local', 'doctor');
insert into public.researchers (id, event_id, name_ar, email, phone, research_title, paper_code, hall)
select '00000000-0000-0000-0000-00000000be08', id, 'أحمد مختبر', 'secret8@test.local', '+9647705550001', 'بحث', 'ARCDT26-918', 'L_208'
from public.events where slug = 'alfarabi-conf-2026';
create temp table got (id uuid, key text, paper_code text, hall text, signed boolean) on commit drop;
create temp table anon_ok (ok boolean) on commit drop;
grant insert on got, anon_ok to authenticated, anon;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000d8","aal":"aal1"}', true);
insert into got select d.id, d.key, d.paper_code, d.hall, d.signed from public.desk_researchers('alfarabi-conf-2026') d;
reset role;
set local role anon;
do $$ begin
  perform public.desk_researchers('alfarabi-conf-2026');
  insert into anon_ok values (true);
exception when others then insert into anon_ok values (false);
end $$;
reset role;

do $$ begin
  if not exists (select 1 from got where id = '00000000-0000-0000-0000-00000000be08' and paper_code = 'ARCDT26-918'
                 and hall = 'L_208' and not signed and key like '%احمد مختبر%' and key like '%arcdt26-918%') then
    raise exception 'FAIL: researcher missing or key wrong %', (select row_to_json(g) from got g where id = '00000000-0000-0000-0000-00000000be08');
  end if;
  if exists (select 1 from got where key like '%secret8%' or key like '%7705550001%') then
    raise exception 'FAIL: the key leaks phone or email';
  end if;
  if (select ok from anon_ok) then raise exception 'FAIL: a guest could load the list'; end if;
  raise notice 'PASS desk_researchers';
end $$;
rollback;
