-- Final-review fixes (Important 1-3, Minor 1 and 6). Rolled back.
begin;
-- card-queue checks: registrations here should not also queue certificates (see cert_on_register.sql)
alter table public.guests disable trigger guests_queue_certificate;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', 'authenticated', 'authenticated');
insert into public.staff (user_id, email, role) values ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', 'admin');
-- certificates off: these checks are about the card queue (certificates on registration: cert_on_register.sql)
update public.events set registration_open = true, cards_enabled = true, certificates_enabled = false where slug = 'alfarabi-conf-2026';
insert into public.templates (event_id, kind, forma_path, width, height, layout)
select id, 'card', 'x/card/forma.png', 100, 100, '{"fields":{}}' from public.events where slug = 'alfarabi-conf-2026';
select public.register_guest('alfarabi-conf-2026', 'Ali Hasan', '+9647701234567', 'wrong@x.org', 'male', 'visitor', 'UoB', 'CS', 'en');

-- Important 1: switching cards off stops queued cards from being claimed
update public.events set cards_enabled = false where slug = 'alfarabi-conf-2026';
set local role service_role;
do $$ begin
  if exists (select 1 from public.claim_deliveries(10)) then raise exception 'FAIL: claimed a card while cards are switched off'; end if;
end $$;
reset role;
update public.events set cards_enabled = true where slug = 'alfarabi-conf-2026';

-- Important 3: the corrected email is where the card goes
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}', true);
do $$ begin
  perform public.admin_update_guest((select (public.admin_list_guests('alfarabi-conf-2026', '', 1, 0)->'rows'->0->>'id')::uuid),
                                    '{"email":"Right@X.org"}');
end $$;
reset role;
do $$ begin
  if public.delivery_context((select id from public.deliveries limit 1))->>'to_email' <> 'right@x.org' then
    raise exception 'FAIL: card still goes to %', public.delivery_context((select id from public.deliveries limit 1))->>'to_email';
  end if;
end $$;

-- Important 2: each resend gets a new send number (used in the email idempotency key)
set local role service_role;
create temp table claimed on commit drop as select * from public.claim_deliveries(10);
reset role;
do $$ begin
  if (select resend_count from claimed) <> 0 then raise exception 'FAIL: first send number'; end if;
end $$;
set local role service_role;
do $$ begin perform public.complete_delivery((select id from claimed), 're_1', 'p'); end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1","aal":"aal2"}', true);
do $$ begin perform public.admin_retry_delivery((public.admin_list_deliveries('alfarabi-conf-2026', 'sent', 1, 0)->'rows'->0->>'id')::uuid); end $$;
reset role;
do $$ begin
  if (select resend_count from public.deliveries) <> 1 then raise exception 'FAIL: resend did not bump send number'; end if;
end $$;
set local role service_role;
do $$ begin
  if (select resend_count from public.claim_deliveries(10)) <> 1 then raise exception 'FAIL: claim does not return send number'; end if;
end $$;
reset role;

-- Minor 1: Persian letters match Arabic ones in search
do $$ begin
  if public.normalize_search('علی کریمی') <> public.normalize_search('علي كريمي') then
    raise exception 'FAIL: persian -> % vs %', public.normalize_search('علی کریمی'), public.normalize_search('علي كريمي');
  end if;
end $$;

-- Minor 6: +964 followed by the local 0 is rejected
set local role anon;
do $$ declare r json := public.register_guest('alfarabi-conf-2026', 'Sara Ali', '+96407701112222', 's@x.org', 'female', 'visitor', 'UoB', 'CS', 'en'); begin
  if r->>'status' <> 'invalid' or r->>'field' <> 'phone' then raise exception 'FAIL: +9640 -> %', r; end if;
end $$;
reset role;

rollback;
select 'review_fixes.sql: all assertions passed' as result;
