-- Registration needs the three-part name (first, father, grandfather) (owner, 18 Nov).
-- A word counts when it has at least two letters and is not an abbreviation ("Dr.", "د.").
-- Must match nameWords() in src/pages/Register.tsx. Admin edits are not affected.

create function public.name_word_count(p text) returns int
language sql immutable set search_path = '' as $$
  select count(*)::int
  from regexp_split_to_table(btrim(coalesce(p, '')), '\s+') w
  where w <> '' and right(w, 1) <> '.' and char_length(regexp_replace(w, '[^[:alpha:]]', '', 'g')) >= 2
$$;

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

revoke execute on function public.name_word_count(text) from public, anon, authenticated;
grant execute on function public.register_guest(text, text, text, text, text, text, text, text, text) to anon, authenticated;
