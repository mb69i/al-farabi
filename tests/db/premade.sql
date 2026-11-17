-- Pre-made certificates (Chromium engine, certs/): the sender emails the stored PDF. Rolled back.
begin;
do $$
declare
  ev uuid := (select id from public.events where slug = 'alfarabi-conf-2026');
  g uuid; r uuid; d1 uuid; d2 uuid; c json;
begin
  insert into public.guests (event_id, serial, full_name, name_script, phone, email, gender, guest_type, workplace, specialization, lang)
  values (ev, 'TSTPRE', 'ضيف الاختبار', 'ar', '+9647700009999', 'premade@test.local', 'male', 'visitor', 'جامعة الاختبار', 'CS', 'ar')
  returning id into g;
  insert into public.researchers (event_id, name_ar, email, research_title, institution)
  values (ev, 'باحث الاختبار', 'res-premade@test.local', 'عنوان تجريبي', 'جامعة')
  returning id into r;

  insert into public.deliveries (event_id, kind, guest_id, to_email, lang, status, prerendered_path)
  values (ev, 'certificate', g, 'premade@test.local', 'ar', 'disabled', ev || '/certificate/demo-abc123.pdf')
  returning id into d1;
  c := public.delivery_context(d1);
  if c->>'prerendered' is distinct from ev || '/certificate/demo-abc123.pdf' then raise exception 'FAIL: prerendered -> %', c; end if;
  if c->'values'->>'full_name' is distinct from 'ضيف الاختبار' then raise exception 'FAIL: guest name -> %', c; end if;
  if c->'values'->>'research_title' is not null then raise exception 'FAIL: attendee got a research title'; end if;
  if c->>'to_email' <> 'premade@test.local' then raise exception 'FAIL: to_email -> %', c; end if;

  -- researchers keep their wording values; no pre-made file means the old path
  insert into public.deliveries (event_id, kind, researcher_id, to_email, lang, status)
  values (ev, 'certificate', r, 'res-premade@test.local', 'ar', 'disabled') returning id into d2;
  c := public.delivery_context(d2);
  if c->'values'->>'research_title' <> 'عنوان تجريبي' or c->>'prerendered' is not null then raise exception 'FAIL: researcher -> %', c; end if;

  -- only a plain PDF path inside the bucket
  begin
    update public.deliveries set prerendered_path = '../secret.pdf' where id = d1;
    raise exception 'FAIL: path with .. accepted';
  exception when check_violation then null; end;
  begin
    update public.deliveries set prerendered_path = ev || '/certificate/x.png' where id = d1;
    raise exception 'FAIL: non-PDF accepted';
  exception when check_violation then null; end;

  if has_function_privilege('anon', 'public.delivery_context(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.delivery_context(uuid)', 'execute')
     or not has_function_privilege('service_role', 'public.delivery_context(uuid)', 'execute') then
    raise exception 'FAIL: delivery_context grants';
  end if;
end $$;
rollback;
select 'premade.sql: all assertions passed' as result;
