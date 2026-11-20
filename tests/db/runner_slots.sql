-- Up to 6 senders at once (load test 20 Nov: one sender managed only 3-7 certificates a minute). Rolled back.
begin;
do $$
declare a int; b int; c int; d int;
begin
  -- a free slot each, never the same twice, none when all are taken
  a := public.acquire_runner_slot(60, 3);
  b := public.acquire_runner_slot(60, 3);
  c := public.acquire_runner_slot(60, 3);
  d := public.acquire_runner_slot(60, 3);
  if a is null or b is null or c is null or a = b or b = c or a = c then raise exception 'FAIL: slots % % %', a, b, c; end if;
  if d is not null then raise exception 'FAIL: a 4th sender got a slot out of 3'; end if;
  perform public.release_runner_slot(b);
  if public.acquire_runner_slot(60, 3) <> b then raise exception 'FAIL: released slot not reused'; end if;
  -- an expired slot (a sender that died) is free again
  update public.runner_slots set expires_at = now() - interval '1 second' where slot = a;
  if public.acquire_runner_slot(60, 3) <> a then raise exception 'FAIL: expired slot not reused'; end if;
  -- there are 6 slots in all
  if (select count(*) from public.runner_slots) <> 6 then raise exception 'FAIL: slot count'; end if;
end $$;

-- the sweep asks for one sender per 6 waiting emails, at most the free slots, at least one when anything waits
-- (guests added here queue their certificates through the real registration trigger)
update public.runner_slots set expires_at = now() - interval '1 second';
create function pg_temp.add_guests(p_n int, p_tag text) returns void language sql as $$
  insert into public.guests (event_id, serial, full_name, name_script, phone, email, gender, workplace, specialization, lang)
  select (select id from public.events where slug = 'alfarabi-conf-2026'), public.new_serial(), 'ضيف اختبار تحميل', 'ar',
         '+9647' || p_tag || lpad(g::text, 6, '0'), p_tag || g || '@test.local', 'male', 'UoB', 'CS', 'ar'
  from generate_series(1, p_n) g
$$;
do $$
begin
  if public.runners_wanted() <> 0 then raise exception 'FAIL: empty queue wants %', public.runners_wanted(); end if;
  perform pg_temp.add_guests(1, '701');
  if public.runners_wanted() <> 1 then raise exception 'FAIL: 1 waiting wants %', public.runners_wanted(); end if;
  perform pg_temp.add_guests(20, '702');
  if public.runners_wanted() <> 4 then raise exception 'FAIL: 21 waiting wants %', public.runners_wanted(); end if;
  perform pg_temp.add_guests(400, '703');
  if public.runners_wanted() <> 6 then raise exception 'FAIL: 421 waiting wants %', public.runners_wanted(); end if;
  update public.runner_slots set expires_at = now() + interval '1 minute' where slot <= 4; -- 4 senders busy
  if public.runners_wanted() <> 2 then raise exception 'FAIL: 2 free slots wants %', public.runners_wanted(); end if;
end $$;

-- only the service role may take slots
do $$ begin
  if has_function_privilege('anon', 'public.acquire_runner_slot(int, int)', 'execute')
     or has_function_privilege('authenticated', 'public.runners_wanted()', 'execute') then
    raise exception 'FAIL: public can touch the sender slots';
  end if;
end $$;
rollback;
select 'runner_slots.sql: all assertions passed' as result;
