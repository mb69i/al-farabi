-- Owner, 19 Nov:
-- 1. Registration asks for the governorate (محافظة): one of Iraq's 18, or outside Iraq. Same codes as
--    src/lib/governorates.ts. Guests registered before this stay empty ("—").
--    register_guest gets a 10th argument with a default, so the form already live (9 arguments) keeps working
--    until the new form is deployed; the new form always sends it and the form itself requires it.
-- 2. Hall-screen numbers add up: male + female = registered. They count registered guests only (the
--    researchers have their own number), where before they added the signed researchers to male/female/VIP.

create function public.governorate_codes() returns text[]
language sql immutable set search_path = '' as $$
  select array['baghdad', 'basra', 'nineveh', 'erbil', 'sulaymaniyah', 'duhok', 'kirkuk', 'anbar', 'diyala',
               'salahaddin', 'babil', 'karbala', 'najaf', 'wasit', 'qadisiyah', 'maysan', 'dhiqar', 'muthanna',
               'outside']
$$;
grant execute on function public.governorate_codes() to anon, authenticated;

alter table public.guests add column governorate text
  constraint guests_governorate_check check (governorate is null or governorate = any (public.governorate_codes()));

drop function public.register_guest(text, text, text, text, text, text, text, text, text);

create function public.register_guest(
  p_slug text, p_full_name text, p_phone text, p_email text, p_gender text,
  p_guest_type text, p_workplace text, p_specialization text, p_lang text, p_governorate text default null)
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
  v_gov text := nullif(lower(btrim(coalesce(p_governorate, ''))), '');
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
  if not public.public_call_allowed() then
    return json_build_object('status', 'rate_limited', 'checked_in_today', false);
  end if;

  if char_length(v_name) not between 3 and 120 or public.name_word_count(v_name) < 3 then
    return json_build_object('status', 'invalid', 'field', 'full_name', 'checked_in_today', false);
  elsif v_phone !~ '^\+[1-9][0-9]{7,14}$' or v_phone ~ '^\+9640' then
    return json_build_object('status', 'invalid', 'field', 'phone', 'checked_in_today', false);
  elsif char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return json_build_object('status', 'invalid', 'field', 'email', 'checked_in_today', false);
  elsif p_gender is null or p_gender not in ('male', 'female') then
    return json_build_object('status', 'invalid', 'field', 'gender', 'checked_in_today', false);
  elsif p_guest_type is not null and p_guest_type not in ('visitor', 'student', 'other') then
    return json_build_object('status', 'invalid', 'field', 'guest_type', 'checked_in_today', false);
  elsif v_gov is not null and not (v_gov = any (public.governorate_codes())) then
    return json_build_object('status', 'invalid', 'field', 'governorate', 'checked_in_today', false);
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
                                 workplace, specialization, lang, governorate)
      values (ev.id, v_serial, v_name, v_script, v_phone, v_email, p_gender, p_guest_type, v_work, v_spec, v_lang, v_gov)
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

revoke execute on function public.register_guest(text, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.register_guest(text, text, text, text, text, text, text, text, text, text) to anon, authenticated;

-- Hall numbers: everything counts registered guests, so male + female = registered.
create or replace function public.get_display_counts(p_slug text) returns json
language sql stable security definer set search_path = '' as $$
  with ev as (select id from public.events where slug = p_slug),
  gs as (select g.* from public.guests g where g.event_id = (select id from ev)),
  signed as (
    select r.* from public.researchers r
    join public.researcher_signoffs s on s.researcher_id = r.id
    where r.event_id = (select id from ev)
  )
  select json_build_object(
    'total', (select count(*) from gs),
    'present_today', (select count(*) from public.guest_checkins c join gs on gs.id = c.guest_id
                      where c.day = public.baghdad_today()),
    'male', (select count(*) from gs where gender = 'male'),
    'female', (select count(*) from gs where gender = 'female'),
    'vip', (select count(*) from gs where is_vip),
    'researchers_signed', (select count(distinct lower(email)) from signed),
    'researchers_total', (select count(distinct lower(r.email)) from public.researchers r where r.event_id = (select id from ev)),
    'theme', coalesce((select value #>> '{}' from public.site_settings where key = 'display_theme'), 'auto'))
$$;

create or replace function public.admin_list_guests(p_slug text, p_search text, p_limit int, p_offset int) returns json
language plpgsql stable security definer set search_path = '' as $$
declare q text := '%' || lower(btrim(coalesce(p_search, ''))) || '%';
begin
  perform public.require_role('admin', 'owner');
  return (
    with f as (
      select g.* from public.guests g
      where g.event_id = public.event_id_of(p_slug)
        and (lower(g.full_name) like q or g.phone like q or g.email like q or lower(g.serial) like q
             or lower(g.workplace) like q))
    select json_build_object(
      'total', (select count(*) from f),
      'rows', coalesce((select json_agg(to_json(x) order by x.created_at desc)
                        from (select id, serial, full_name, phone, email, gender, guest_type, workplace, specialization,
                                     governorate, lang, is_vip, created_at
                              from f order by created_at desc
                              limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0))) x), '[]')));
end $$;

create or replace function public.admin_export(p_slug text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare v_event uuid := public.event_id_of(p_slug);
begin
  perform public.require_role('admin', 'owner');
  return json_build_object(
    'guests', coalesce((select json_agg(to_json(x) order by x.created_at)
                        from (select id, serial, full_name, phone, email, gender, guest_type, workplace, specialization,
                                     governorate, lang, is_vip, created_at from public.guests where event_id = v_event) x), '[]'),
    'researchers', coalesce((select json_agg(to_json(x) order by x.name_ar)
                             from (select r.id, r.name_ar, r.name_en, r.email, r.phone, r.gender, r.institution,
                                          r.research_title, r.is_vip, s.signed_at, st.display_name as doctor_name,
                                          s.signature_path
                                   from public.researchers r
                                   left join public.researcher_signoffs s on s.researcher_id = r.id
                                   left join public.staff st on st.user_id = s.doctor_id
                                   where r.event_id = v_event) x), '[]'),
    'checkins', coalesce((select json_agg(to_json(x) order by x.at)
                          from (select g.serial, g.full_name, c.day, c.at
                                from public.guest_checkins c join public.guests g on g.id = c.guest_id
                                where g.event_id = v_event) x), '[]'));
end $$;
