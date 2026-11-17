-- Fixes from the whole-branch review.

-- (1) A switch that is off holds jobs that are already queued: claim only kinds whose switch is on.
create or replace function public.claim_deliveries(p_limit int default 10) returns setof public.deliveries
language sql volatile security definer set search_path = '' as $$
  with c as (
    select d.id from public.deliveries d
    join public.events e on e.id = d.event_id
    where ((d.status = 'queued' and d.next_attempt_at <= now())
        or (d.status = 'sending' and d.next_attempt_at <= now() - interval '5 minutes'))
      and case d.kind when 'card' then e.cards_enabled else e.certificates_enabled end
    order by d.next_attempt_at, d.created_at
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update of d skip locked)
  update public.deliveries d set status = 'sending', next_attempt_at = now()
  from c where d.id = c.id
  returning d.*
$$;

-- (2) Every resend gets a new send number; the sender puts it in the email idempotency key.
alter table public.deliveries add column resend_count int not null default 0;

create or replace function public.admin_retry_delivery(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.require_role('admin', 'owner');
  update public.deliveries
     set status = 'queued', attempts = 0, last_error = null, next_attempt_at = now(), resend_count = resend_count + 1
   where id = p_id;
  perform public.audit('delivery_retry', p_id::text, null);
end $$;

-- (3) Send to the person's current email, so an admin correction takes effect.
create or replace function public.delivery_context(p_id uuid) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'kind', d.kind,
    'lang', d.lang,
    'to_email', coalesce(g.email, r.email, d.to_email),
    'values', case when d.kind = 'card' then
        json_build_object('full_name', g.full_name, 'serial', g.serial,
                          'event_name', case when d.lang = 'en' then e.name_en else e.name_ar end)
      else
        json_build_object('full_name', case when d.lang = 'en' and r.name_en is not null then r.name_en else r.name_ar end,
                          'research_title', r.research_title, 'institution', coalesce(r.institution, ''),
                          'event_name', case when d.lang = 'en' then e.name_en else e.name_ar end)
      end,
    'template', (select json_build_object('forma_path', t.forma_path, 'width', t.width, 'height', t.height, 'layout', t.layout)
                 from public.templates t where t.event_id = d.event_id and t.kind = d.kind))
  from public.deliveries d
  join public.events e on e.id = d.event_id
  left join public.guests g on g.id = d.guest_id
  left join public.researchers r on r.id = d.researcher_id
  where d.id = p_id
$$;

-- (4) Persian ی and ک match Arabic ي and ك (Iranian researchers). Must match src/lib/normalize.ts.
create or replace function public.normalize_search(s text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(
    translate(
      regexp_replace(lower(coalesce(s, '')), '[ً-ْـ]', '', 'g'),
      'أإآٱةىؤئیک', 'ااااهيوييك'),
    '\s+', ' ', 'g'))
$$;
update public.researchers set name_ar = name_ar;  -- recompute stored search keys

-- (5) "+964 0…" (country code with the local 0 kept) is not a valid Iraqi number.
create or replace function public.register_guest(
  p_slug text, p_full_name text, p_phone text, p_email text, p_gender text,
  p_guest_type text, p_workplace text, p_specialization text, p_lang text)
returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  ev public.events;
  v_name text := regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g');
  v_phone text := btrim(coalesce(p_phone, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_work text := regexp_replace(btrim(coalesce(p_workplace, '')), '\s+', ' ', 'g');
  v_spec text := regexp_replace(btrim(coalesce(p_specialization, '')), '\s+', ' ', 'g');
  v_lang text := case when p_lang = 'en' then 'en' else 'ar' end;
  v_script text;
  v_today date := public.baghdad_today();
  g record;
  v_id uuid;
  v_serial text;
begin
  select * into ev from public.events where slug = p_slug;
  if ev.id is null or not ev.registration_open then
    return json_build_object('status', 'closed', 'checked_in_today', false);
  end if;

  if char_length(v_name) not between 3 and 120 then
    return json_build_object('status', 'invalid', 'field', 'full_name', 'checked_in_today', false);
  elsif v_phone !~ '^\+[1-9][0-9]{7,14}$' or v_phone ~ '^\+9640' then
    return json_build_object('status', 'invalid', 'field', 'phone', 'checked_in_today', false);
  elsif char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return json_build_object('status', 'invalid', 'field', 'email', 'checked_in_today', false);
  elsif p_gender is null or p_gender not in ('male', 'female') then
    return json_build_object('status', 'invalid', 'field', 'gender', 'checked_in_today', false);
  elsif p_guest_type is null or p_guest_type not in ('visitor', 'student', 'other') then
    return json_build_object('status', 'invalid', 'field', 'guest_type', 'checked_in_today', false);
  elsif char_length(v_work) not between 2 and 160 then
    return json_build_object('status', 'invalid', 'field', 'workplace', 'checked_in_today', false);
  elsif char_length(v_spec) not between 2 and 160 then
    return json_build_object('status', 'invalid', 'field', 'specialization', 'checked_in_today', false);
  end if;

  v_script := case
    when v_name ~ '[؀-ۿ]' and v_name ~ '[A-Za-z]' then 'mixed'
    when v_name ~ '[؀-ۿ]' then 'ar'
    else 'en' end;

  for attempt in 1..5 loop
    select id, serial into g from public.guests
     where event_id = ev.id and (phone = v_phone or email = v_email)
     order by created_at limit 1;
    if g.id is not null then
      insert into public.guest_checkins (guest_id, day) values (g.id, v_today) on conflict do nothing;
      return json_build_object('status', 'already_registered', 'serial', g.serial, 'checked_in_today', true);
    end if;

    begin
      v_serial := public.new_serial();
      insert into public.guests (event_id, serial, full_name, name_script, phone, email, gender, guest_type,
                                 workplace, specialization, lang)
      values (ev.id, v_serial, v_name, v_script, v_phone, v_email, p_gender, p_guest_type, v_work, v_spec, v_lang)
      returning id into v_id;
    exception when unique_violation then
      continue;
    end;

    insert into public.guest_checkins (guest_id, day) values (v_id, v_today);
    insert into public.deliveries (event_id, kind, guest_id, to_email, lang, status)
    values (ev.id, 'card', v_id, v_email, v_lang, public.delivery_initial_status(ev.id, 'card'));
    return json_build_object('status', 'created', 'serial', v_serial, 'checked_in_today', true);
  end loop;
  raise exception 'could not register guest';
end $$;

-- create or replace keeps existing grants; restate the intended ones for clarity
revoke execute on function public.claim_deliveries(int), public.delivery_context(uuid) from public, anon, authenticated;
grant execute on function public.claim_deliveries(int), public.delivery_context(uuid) to service_role;
revoke execute on function public.normalize_search(text) from public, anon, authenticated;
grant execute on function public.register_guest(text, text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.admin_retry_delivery(uuid) to authenticated;
