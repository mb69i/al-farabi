-- Public (anon) functions: event info, guest registration, day check-in, hall counters.
-- Inputs are re-validated here; the browser's checks are only for convenience.

create function public.new_serial() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(6);
  out text := 'ALF26-';
begin
  for i in 0..5 loop
    out := out || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return out;
end $$;

-- Status for a new card/certificate job: switch off -> disabled, no design yet -> waiting_template.
create function public.delivery_initial_status(p_event_id uuid, p_kind text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not (case p_kind when 'card' then e.cards_enabled else e.certificates_enabled end) then 'disabled'
    when not exists (select 1 from public.templates t where t.event_id = e.id and t.kind = p_kind) then 'waiting_template'
    else 'queued'
  end
  from public.events e where e.id = p_event_id
$$;

create function public.get_public_event(p_slug text) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'id', e.id, 'slug', e.slug, 'name_ar', e.name_ar, 'name_en', e.name_en,
    'starts_on', e.starts_on, 'ends_on', e.ends_on, 'registration_open', e.registration_open)
  from public.events e where e.slug = p_slug
$$;

create function public.register_guest(
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
  elsif v_phone !~ '^\+[1-9][0-9]{7,14}$' then
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
      -- serial clash, or a parallel registration with the same phone/email: look again
      continue;
    end;

    insert into public.guest_checkins (guest_id, day) values (v_id, v_today);
    insert into public.deliveries (event_id, kind, guest_id, to_email, lang, status)
    values (ev.id, 'card', v_id, v_email, v_lang, public.delivery_initial_status(ev.id, 'card'));
    return json_build_object('status', 'created', 'serial', v_serial, 'checked_in_today', true);
  end loop;
  raise exception 'could not register guest';
end $$;

create function public.checkin_guest(p_slug text, p_serial text, p_phone text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  ev public.events;
  v_id uuid;
begin
  select * into ev from public.events where slug = p_slug;
  if ev.id is null or not ev.registration_open then
    return json_build_object('status', 'closed', 'checked_in_today', false);
  end if;
  select id into v_id from public.guests
   where event_id = ev.id and serial = upper(btrim(coalesce(p_serial, ''))) and phone = btrim(coalesce(p_phone, ''));
  if v_id is null then
    return json_build_object('status', 'not_found', 'checked_in_today', false);
  end if;
  insert into public.guest_checkins (guest_id, day) values (v_id, public.baghdad_today()) on conflict do nothing;
  return json_build_object('status', 'ok', 'checked_in_today', true);
end $$;

create function public.get_display_counts(p_slug text) returns json
language sql stable security definer set search_path = '' as $$
  with ev as (select id from public.events where slug = p_slug),
  signed as (
    select r.* from public.researchers r
    join public.researcher_signoffs s on s.researcher_id = r.id
    where r.event_id = (select id from ev)
  )
  select json_build_object(
    'total', (select count(*) from public.guests g where g.event_id = (select id from ev)),
    'present_today', (select count(*) from public.guest_checkins c join public.guests g on g.id = c.guest_id
                      where g.event_id = (select id from ev) and c.day = public.baghdad_today()),
    'male', (select count(*) from public.guests g where g.event_id = (select id from ev) and g.gender = 'male')
            + (select count(distinct lower(email)) from signed where gender = 'male'),
    'female', (select count(*) from public.guests g where g.event_id = (select id from ev) and g.gender = 'female')
              + (select count(distinct lower(email)) from signed where gender = 'female'),
    'vip', (select count(*) from public.guests g where g.event_id = (select id from ev) and g.is_vip)
           + (select count(distinct lower(email)) from signed where is_vip),
    'researchers_signed', (select count(distinct lower(email)) from signed),
    'researchers_total', (select count(distinct lower(r.email)) from public.researchers r where r.event_id = (select id from ev)))
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.whoami() to authenticated;
grant execute on function public.get_public_event(text) to anon, authenticated;
grant execute on function public.register_guest(text, text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.checkin_guest(text, text, text) to anon, authenticated;
grant execute on function public.get_display_counts(text) to anon, authenticated;
