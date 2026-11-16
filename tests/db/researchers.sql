-- Task 4 tests: researcher search, idempotent sign-off, private signature storage. Rolled back.
begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'doctor@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner@test.local', 'authenticated', 'authenticated');
insert into public.staff (user_id, email, role) values
  ('00000000-0000-0000-0000-0000000000d1', 'doctor@test.local', 'doctor'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', 'admin'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner@test.local', 'owner');

update public.events set certificates_enabled = true where slug = 'alfarabi-conf-2026';
insert into public.templates (event_id, kind, forma_path, width, height, layout)
select id, 'certificate', 'x/certificate/forma.png', 100, 100, '{"fields":{}}' from public.events where slug = 'alfarabi-conf-2026';

insert into public.researchers (id, event_id, name_ar, name_en, email, gender, institution, research_title)
select '00000000-0000-0000-0000-00000000aa01', id, 'أحمد علي', 'Ahmed Ali', 'ahmed@uni.edu', 'male', 'جامعة بغداد', 'بحث أول'
from public.events where slug = 'alfarabi-conf-2026';
insert into public.researchers (id, event_id, name_ar, name_en, email, institution, research_title)
select '00000000-0000-0000-0000-00000000aa02', id, 'سارة محمود', null, 'sara@uni.edu', 'جامعة البصرة', 'بحث ثان'
from public.events where slug = 'alfarabi-conf-2026';

create temp table ctx on commit drop as
select id as ev, 'signatures/' || id || '/00000000-0000-0000-0000-00000000aa01/' as pfx,
       id || '/00000000-0000-0000-0000-00000000aa01/' as obj
from public.events where slug = 'alfarabi-conf-2026';
grant select on ctx to anon, authenticated;

-- search_key trigger fills a normalised key
do $$ begin
  if (select search_key from public.researchers where id = '00000000-0000-0000-0000-00000000aa01')
     <> 'احمد علي ahmed ali ahmed@uni.edu' then
    raise exception 'FAIL: search_key -> %', (select search_key from public.researchers where id = '00000000-0000-0000-0000-00000000aa01');
  end if;
end $$;

-- anon cannot search
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  begin
    perform * from public.search_researchers('alfarabi-conf-2026', 'احمد');
    raise exception 'FAIL: anon searched';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- doctor search matches Arabic variants and English names
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000d1","aal":"aal1"}', true);
do $$ begin
  if (select count(*) from public.search_researchers('alfarabi-conf-2026', 'احمد')) <> 1 then raise exception 'FAIL: احمد'; end if;
  if (select count(*) from public.search_researchers('alfarabi-conf-2026', 'AHMED')) <> 1 then raise exception 'FAIL: AHMED'; end if;
  if (select count(*) from public.search_researchers('alfarabi-conf-2026', 'ساره')) <> 1 then raise exception 'FAIL: ساره'; end if;
  if (select signed from public.search_researchers('alfarabi-conf-2026', 'احمد')) then raise exception 'FAIL: signed too early'; end if;
end $$;

-- doctor search under 2 characters returns error
do $$ begin
  begin
    perform * from public.search_researchers('alfarabi-conf-2026', ' ا ');
    raise exception 'FAIL: short query allowed';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- doctor can upload a signature only under the researcher's own folder
insert into storage.objects (bucket_id, name) select 'signatures', obj || '1.png' from ctx;
do $$ begin
  begin
    insert into storage.objects (bucket_id, name)
    select 'signatures', ev || '/00000000-0000-0000-0000-00000000aa02x/1.png' from ctx;
    raise exception 'FAIL: upload outside researcher folder allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

-- doctor cannot read signatures bucket
do $$ begin
  if exists (select 1 from storage.objects where bucket_id = 'signatures') then raise exception 'FAIL: doctor can read signatures'; end if;
end $$;

-- sign_off rejects path for another researcher
do $$ begin
  begin
    perform public.sign_off_researcher('00000000-0000-0000-0000-00000000aa02',
      (select pfx from ctx) || '1.png', (select pfx from ctx) || '1.json', repeat('a', 64), 'tablet');
    raise exception 'FAIL: foreign path accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- sign_off twice returns already_signed and one delivery
do $$ declare r json; begin
  r := public.sign_off_researcher('00000000-0000-0000-0000-00000000aa01',
    (select pfx from ctx) || '1.png', (select pfx from ctx) || '1.json', repeat('a', 64), 'iPad');
  if r->>'status' <> 'signed' then raise exception 'FAIL: first sign -> %', r; end if;
  r := public.sign_off_researcher('00000000-0000-0000-0000-00000000aa01',
    (select pfx from ctx) || '2.png', (select pfx from ctx) || '2.json', repeat('b', 64), 'iPad');
  if r->>'status' <> 'already_signed' then raise exception 'FAIL: second sign -> %', r; end if;
  if not (select signed from public.search_researchers('alfarabi-conf-2026', 'احمد')) then raise exception 'FAIL: not marked signed'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.researcher_signoffs) <> 1 then raise exception 'FAIL: signoff rows'; end if;
  if (select count(*) from public.deliveries where kind = 'certificate') <> 1 then raise exception 'FAIL: certificate jobs'; end if;
  if (select status from public.deliveries where kind = 'certificate') <> 'queued' then raise exception 'FAIL: certificate not queued'; end if;
  if (select lang from public.deliveries where kind = 'certificate') <> 'ar' then raise exception 'FAIL: lang'; end if;
  if (select doctor_id from public.researcher_signoffs) <> '00000000-0000-0000-0000-0000000000d1' then raise exception 'FAIL: doctor_id'; end if;
  if not exists (select 1 from public.audit_log where action = 'sign_off') then raise exception 'FAIL: audit'; end if;
end $$;

-- certificates paused: signature saved, job held
update public.events set certificates_enabled = false where slug = 'alfarabi-conf-2026';
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000d1","aal":"aal1"}', true);
do $$ declare r json; p text := (select ev from ctx) || '/00000000-0000-0000-0000-00000000aa02/'; begin
  r := public.sign_off_researcher('00000000-0000-0000-0000-00000000aa02', 'signatures/' || p || '1.png', 'signatures/' || p || '1.json', repeat('c', 64), 'iPad');
  if r->>'status' <> 'certificates_paused' then raise exception 'FAIL: paused -> %', r; end if;
end $$;
reset role;

-- admin (aal2) can read signatures; doctor cannot delete; owner can
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}', true);
do $$ begin
  if not exists (select 1 from storage.objects where bucket_id = 'signatures') then raise exception 'FAIL: admin cannot read signatures'; end if;
  if public.storage_is_owner() then raise exception 'FAIL: admin counted as owner'; end if;
end $$;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000d1","aal":"aal1"}', true);
do $$ begin
  if public.storage_is_owner() then raise exception 'FAIL: doctor may delete'; end if;
end $$;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000b1","aal":"aal2"}', true);
do $$ begin
  if not public.storage_is_owner() then raise exception 'FAIL: owner may not delete'; end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                 and cmd = 'DELETE' and qual like '%signatures%' and qual like '%storage_is_owner%') then
    raise exception 'FAIL: delete policy missing';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and cmd in ('UPDATE', 'ALL') and coalesce(qual, '') like '%signatures%') then
    raise exception 'FAIL: signatures must not be updatable';
  end if;
  if (select public from storage.buckets where id = 'signatures') then raise exception 'FAIL: bucket public'; end if;
end $$;

rollback;
select 'researchers.sql: all assertions passed' as result;
