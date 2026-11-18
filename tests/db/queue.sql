-- Task 6 tests: delivery queue, backoff, runner lease, automatic kick. Rolled back.
begin;
-- card-queue checks: registrations here should not also queue certificates (see cert_on_register.sql)
alter table public.guests disable trigger guests_queue_certificate;

-- certificates off: this file tests the card queue (certificates on registration: cert_on_register.sql)
update public.events set registration_open = true, cards_enabled = true, certificates_enabled = false
 where slug = 'alfarabi-conf-2026';
insert into public.templates (event_id, kind, forma_path, width, height, layout)
select id, k, 'alfarabi-conf-2026/' || k || '/forma.png', 1600, 1000, '{"fields":{}}'
from public.events, unnest(array['card', 'certificate']) k where slug = 'alfarabi-conf-2026';

-- 20 queued card jobs
do $$ begin
  for i in 1..20 loop
    perform public.register_guest('alfarabi-conf-2026', 'Guest ' || i, '+96477000000' || lpad(i::text, 2, '0'),
                                  'g' || i || '@x.org', 'female', 'student', 'UoB', 'CS', 'ar');
  end loop;
end $$;

-- anon and admin cannot call claim_deliveries (service_role only)
do $$ begin
  if has_function_privilege('anon', 'public.claim_deliveries(int)', 'execute')
     or has_function_privilege('authenticated', 'public.claim_deliveries(int)', 'execute') then
    raise exception 'FAIL: claim_deliveries exposed';
  end if;
  if not has_function_privilege('service_role', 'public.claim_deliveries(int)', 'execute') then
    raise exception 'FAIL: service_role cannot claim';
  end if;
  if not has_function_privilege('service_role', 'public.delivery_context(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.delivery_context(uuid)', 'execute') then
    raise exception 'FAIL: delivery_context grants';
  end if;
end $$;

-- claims never return the same row; claimed rows become 'sending'
set local role service_role;
create temp table c1 on commit drop as select id from public.claim_deliveries(10);
create temp table c2 on commit drop as select id from public.claim_deliveries(10);
reset role;
do $$ begin
  if (select count(*) from c1) <> 10 or (select count(*) from c2) <> 10 then raise exception 'FAIL: claim sizes'; end if;
  if exists (select 1 from c1 join c2 using (id)) then raise exception 'FAIL: overlapping claims'; end if;
  if (select count(*) from public.deliveries where status = 'sending') <> 20 then raise exception 'FAIL: not sending'; end if;
  if position('skip locked' in lower(pg_get_functiondef('public.claim_deliveries(int)'::regprocedure))) = 0 then
    raise exception 'FAIL: claim must use FOR UPDATE SKIP LOCKED';
  end if;
end $$;

-- stale sending is reclaimed after 5 minutes (fresh ones are not)
update public.deliveries set next_attempt_at = now() - interval '6 minutes' where id in (select id from c1 limit 3);
set local role service_role;
create temp table c3 on commit drop as select id from public.claim_deliveries(50);
reset role;
do $$ begin
  if (select count(*) from c3) <> 3 then raise exception 'FAIL: stale reclaim count %', (select count(*) from c3); end if;
end $$;

-- fail_delivery applies backoff 1,2,5,15,60 then failed
create temp table one on commit drop as select id from c2 limit 1;
grant select on one to service_role;
set local role service_role;
do $$ declare d uuid := (select id from one); w int[] := array[1, 2, 5, 15, 60]; got interval; begin
  for i in 1..5 loop
    perform public.fail_delivery(d, 'boom ' || i);
    select next_attempt_at - now() into got from public.deliveries where id = d;
    if got <> make_interval(mins => w[i]) or (select status from public.deliveries where id = d) <> 'queued' then
      raise exception 'FAIL: attempt % -> % %', i, got, (select status from public.deliveries where id = d);
    end if;
  end loop;
  perform public.fail_delivery(d, 'final');
  if (select status from public.deliveries where id = d) <> 'failed' or (select attempts from public.deliveries where id = d) <> 6
     or (select last_error from public.deliveries where id = d) <> 'final' then
    raise exception 'FAIL: not failed after 6 attempts';
  end if;
end $$;

-- complete_delivery marks sent
do $$ declare d uuid := (select id from c2 offset 1 limit 1); begin
  perform public.complete_delivery(d, 're_123', 'x/card/1.png');
  if (select status from public.deliveries where id = d) <> 'sent' or (select sent_at from public.deliveries where id = d) is null
     or (select provider_id from public.deliveries where id = d) <> 're_123' then
    raise exception 'FAIL: complete';
  end if;
end $$;

-- delivery_context for a guest card
do $$ declare c json := public.delivery_context((select id from c2 offset 2 limit 1)); begin
  if c->>'kind' <> 'card' or c->>'lang' <> 'ar' or c->'values'->>'serial' !~ '^ALF26-' or c->'values'->>'full_name' !~ '^Guest '
     or c->'values'->>'event_name' <> 'مؤتمر الفارابي للبحوث التطبيقية في التحول الرقمي الشامل'
     or c->'template'->>'forma_path' <> 'alfarabi-conf-2026/card/forma.png' or c->'template'->'layout' is null then
    raise exception 'FAIL: guest context -> %', c;
  end if;
end $$;
reset role;

-- delivery_context picks name_en for en researcher and falls back to name_ar
insert into public.researchers (id, event_id, name_ar, name_en, email, institution, research_title)
select '00000000-0000-0000-0000-00000000bb01', id, 'جون سميث', 'John Smith', 'john@uni.edu', 'UoS', 'Smart Grids'
from public.events where slug = 'alfarabi-conf-2026';
insert into public.researchers (id, event_id, name_ar, name_en, email, institution, research_title)
select '00000000-0000-0000-0000-00000000bb02', id, 'Maria Lopez', null, 'maria@uni.edu', 'UoM', 'Edge AI'
from public.events where slug = 'alfarabi-conf-2026';
insert into public.deliveries (event_id, kind, researcher_id, to_email, lang, status)
select id, 'certificate', '00000000-0000-0000-0000-00000000bb01', 'john@uni.edu', 'en', 'queued' from public.events where slug = 'alfarabi-conf-2026';
insert into public.deliveries (event_id, kind, researcher_id, to_email, lang, status)
select id, 'certificate', '00000000-0000-0000-0000-00000000bb02', 'maria@uni.edu', 'en', 'queued' from public.events where slug = 'alfarabi-conf-2026';
do $$ declare a json; b json; begin
  a := public.delivery_context((select id from public.deliveries where researcher_id = '00000000-0000-0000-0000-00000000bb01'));
  b := public.delivery_context((select id from public.deliveries where researcher_id = '00000000-0000-0000-0000-00000000bb02'));
  if a->'values'->>'full_name' <> 'John Smith' or a->'values'->>'research_title' <> 'Smart Grids'
     or a->'values'->>'event_name' not like 'Al-Farabi Conference%' or a->'template'->>'forma_path' not like '%certificate%' then
    raise exception 'FAIL: en researcher -> %', a;
  end if;
  if b->'values'->>'full_name' <> 'Maria Lopez' then raise exception 'FAIL: fallback -> %', b; end if;
end $$;

-- runner lease: one holder at a time
set local role service_role;
do $$ begin
  if not public.acquire_runner(75) then raise exception 'FAIL: first acquire'; end if;
  if public.acquire_runner(75) then raise exception 'FAIL: second acquire while held'; end if;
  perform public.release_runner();
  if not public.acquire_runner(75) then raise exception 'FAIL: acquire after release'; end if;
end $$;
reset role;
-- an expired lease can be taken over
update public.runner_lease set expires_at = now() - interval '1 second';
set local role service_role;
do $$ begin
  if not public.acquire_runner(75) then raise exception 'FAIL: expired lease not taken over'; end if;
end $$;
reset role;

-- automatic kick: triggers exist, cron job exists, and kicking without configured secrets is a safe no-op
do $$ begin
  if (select count(*) from pg_trigger where tgrelid = 'public.deliveries'::regclass and tgname like 'deliveries_kick%') <> 2 then
    raise exception 'FAIL: kick triggers';
  end if;
  if not exists (select 1 from cron.job where jobname = 'deliver-sweep' and schedule = '* * * * *') then
    raise exception 'FAIL: cron job';
  end if;
  perform public.kick_delivery_runner();
  if has_function_privilege('anon', 'public.kick_delivery_runner()', 'execute')
     or has_function_privilege('authenticated', 'public.kick_delivery_runner()', 'execute') then
    raise exception 'FAIL: kick exposed';
  end if;
end $$;

rollback;
select 'queue.sql: all assertions passed' as result;

-- pg_net must not live in the public schema (security advisor 0014)
do $$ begin
  if (select extnamespace::regnamespace::text from pg_extension where extname = 'pg_net') <> 'extensions' then
    raise exception 'FAIL: pg_net is in schema %', (select extnamespace::regnamespace::text from pg_extension where extname = 'pg_net');
  end if;
end $$;
select 'pg_net schema ok' as result;
