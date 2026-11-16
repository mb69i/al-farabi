-- Admin (admin/owner at aal2) and owner-only functions, staff bootstrap, delivery release.
-- Every write is recorded in audit_log.

-- Internal: move held jobs to the queue once the switch is on and the design exists.
create function public.release_deliveries(p_event_id uuid, p_kind text) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  if public.delivery_initial_status(p_event_id, p_kind) <> 'queued' then
    return 0;
  end if;
  update public.deliveries
     set status = 'queued', next_attempt_at = now()
   where event_id = p_event_id and kind = p_kind and status in ('disabled', 'waiting_template');
  get diagnostics n = row_count;
  return n;
end $$;

create function public.event_id_of(p_slug text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.events where slug = p_slug
$$;

create function public.admin_overview(p_slug text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare ev public.events; c json;
begin
  perform public.require_role('admin', 'owner');
  select * into ev from public.events where slug = p_slug;
  c := public.get_display_counts(p_slug);
  return (c::jsonb || jsonb_build_object(
    'switches', jsonb_build_object('registration_open', ev.registration_open, 'cards_enabled', ev.cards_enabled,
                                   'certificates_enabled', ev.certificates_enabled),
    'deliveries', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'status', status, 'count', n) order by kind, status)
                            from (select kind, status, count(*) n from public.deliveries where event_id = ev.id group by 1, 2) x), '[]')
  ))::json;
end $$;

create function public.admin_list_guests(p_slug text, p_search text, p_limit int, p_offset int) returns json
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
                                     lang, is_vip, created_at
                              from f order by created_at desc
                              limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0))) x), '[]')));
end $$;

create function public.admin_update_guest(p_id uuid, p_patch jsonb) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare g public.guests;
begin
  perform public.require_role('admin', 'owner');
  update public.guests set
    full_name = coalesce(nullif(btrim(p_patch ->> 'full_name'), ''), full_name),
    phone = coalesce(nullif(btrim(p_patch ->> 'phone'), ''), phone),
    email = coalesce(nullif(lower(btrim(p_patch ->> 'email')), ''), email),
    gender = coalesce(p_patch ->> 'gender', gender),
    guest_type = coalesce(p_patch ->> 'guest_type', guest_type),
    workplace = coalesce(nullif(btrim(p_patch ->> 'workplace'), ''), workplace),
    specialization = coalesce(nullif(btrim(p_patch ->> 'specialization'), ''), specialization),
    is_vip = coalesce((p_patch ->> 'is_vip')::boolean, is_vip)
  where id = p_id
  returning * into g;
  if g.id is null then
    raise exception 'guest not found' using errcode = '22023';
  end if;
  perform public.audit('guest_update', p_id::text, p_patch);
  return json_build_object('id', g.id, 'serial', g.serial, 'full_name', g.full_name, 'phone', g.phone, 'email', g.email,
                           'gender', g.gender, 'guest_type', g.guest_type, 'workplace', g.workplace,
                           'specialization', g.specialization, 'lang', g.lang, 'is_vip', g.is_vip, 'created_at', g.created_at);
end $$;

create function public.admin_delete_guest(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_name text;
begin
  perform public.require_role('admin', 'owner');
  delete from public.guests where id = p_id returning full_name into v_name;
  perform public.audit('guest_delete', p_id::text, jsonb_build_object('full_name', v_name));
end $$;

create function public.admin_import_researchers(p_slug text, p_rows jsonb) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_event uuid := public.event_id_of(p_slug);
  r jsonb;
  n int;
  v_inserted int := 0;
  v_updated int := 0;
  v_errors jsonb := '[]';
  v_name_ar text; v_email text; v_phone text; v_title text; v_gender text; v_is_insert boolean;
begin
  perform public.require_role('admin', 'owner');
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'rows must be an array' using errcode = '22023';
  end if;
  for r, n in select value, ordinality from jsonb_array_elements(p_rows) with ordinality loop
    v_name_ar := btrim(coalesce(r ->> 'name_ar', ''));
    v_email := lower(btrim(coalesce(r ->> 'email', '')));
    v_phone := nullif(btrim(coalesce(r ->> 'phone', '')), '');
    v_title := btrim(coalesce(r ->> 'research_title', ''));
    v_gender := nullif(r ->> 'gender', '');
    if v_name_ar = '' then
      v_errors := v_errors || jsonb_build_object('row', n, 'message', 'name');
    elsif v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      v_errors := v_errors || jsonb_build_object('row', n, 'message', 'email');
    elsif v_phone is not null and v_phone !~ '^\+[1-9][0-9]{7,14}$' then
      v_errors := v_errors || jsonb_build_object('row', n, 'message', 'phone');
    elsif v_title = '' then
      v_errors := v_errors || jsonb_build_object('row', n, 'message', 'research_title');
    elsif v_gender is not null and v_gender not in ('male', 'female') then
      v_errors := v_errors || jsonb_build_object('row', n, 'message', 'gender');
    else
      insert into public.researchers (event_id, name_ar, name_en, email, phone, gender, institution, research_title)
      values (v_event, v_name_ar, nullif(btrim(coalesce(r ->> 'name_en', '')), ''), v_email, v_phone, v_gender,
              nullif(btrim(coalesce(r ->> 'institution', '')), ''), v_title)
      on conflict (event_id, email, research_title) do update set
        name_ar = excluded.name_ar,
        name_en = coalesce(excluded.name_en, public.researchers.name_en),
        phone = coalesce(excluded.phone, public.researchers.phone),
        gender = coalesce(excluded.gender, public.researchers.gender),
        institution = coalesce(excluded.institution, public.researchers.institution)
      returning (xmax = 0) into v_is_insert;
      if v_is_insert then v_inserted := v_inserted + 1; else v_updated := v_updated + 1; end if;
    end if;
  end loop;
  perform public.audit('researchers_import', p_slug,
                       jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'errors', jsonb_array_length(v_errors)));
  return json_build_object('inserted', v_inserted, 'updated', v_updated, 'errors', v_errors);
end $$;

create function public.admin_list_researchers(p_slug text, p_search text, p_limit int, p_offset int) returns json
language plpgsql stable security definer set search_path = '' as $$
declare q text := public.normalize_search(p_search);
begin
  perform public.require_role('admin', 'owner');
  return (
    with f as (
      select r.*, s.signed_at, s.signature_path, st.display_name as doctor_name
      from public.researchers r
      left join public.researcher_signoffs s on s.researcher_id = r.id
      left join public.staff st on st.user_id = s.doctor_id
      where r.event_id = public.event_id_of(p_slug) and (q = '' or r.search_key like '%' || q || '%'))
    select json_build_object(
      'total', (select count(*) from f),
      'rows', coalesce((select json_agg(to_json(x) order by x.name_ar)
                        from (select id, name_ar, name_en, email, phone, gender, institution, research_title, is_vip,
                                     signed_at, doctor_name, signature_path
                              from f order by name_ar
                              limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0))) x), '[]')));
end $$;

create function public.admin_set_vip(p_kind text, p_id uuid, p_value boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.require_role('admin', 'owner');
  if p_kind = 'guest' then
    update public.guests set is_vip = p_value where id = p_id;
  elsif p_kind = 'researcher' then
    update public.researchers set is_vip = p_value where id = p_id;
  else
    raise exception 'bad kind' using errcode = '22023';
  end if;
  perform public.audit('set_vip', p_kind || ':' || p_id, jsonb_build_object('value', p_value));
end $$;

create function public.admin_set_switches(p_slug text, p_registration_open boolean, p_cards_enabled boolean,
                                          p_certificates_enabled boolean) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare ev public.events;
begin
  perform public.require_role('admin', 'owner');
  update public.events set registration_open = p_registration_open, cards_enabled = p_cards_enabled,
                           certificates_enabled = p_certificates_enabled
   where slug = p_slug returning * into ev;
  if ev.id is null then
    raise exception 'event not found' using errcode = '22023';
  end if;
  perform public.release_deliveries(ev.id, 'card');
  perform public.release_deliveries(ev.id, 'certificate');
  perform public.audit('switches', p_slug, jsonb_build_object('registration_open', p_registration_open,
                       'cards_enabled', p_cards_enabled, 'certificates_enabled', p_certificates_enabled));
  return json_build_object('registration_open', ev.registration_open, 'cards_enabled', ev.cards_enabled,
                           'certificates_enabled', ev.certificates_enabled);
end $$;

create function public.admin_list_deliveries(p_slug text, p_status text, p_limit int, p_offset int) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_role('admin', 'owner');
  return (
    with f as (
      select d.*, coalesce(g.full_name, r.name_ar) as name
      from public.deliveries d
      left join public.guests g on g.id = d.guest_id
      left join public.researchers r on r.id = d.researcher_id
      where d.event_id = public.event_id_of(p_slug) and (coalesce(p_status, '') = '' or d.status = p_status))
    select json_build_object(
      'total', (select count(*) from f),
      'rows', coalesce((select json_agg(to_json(x) order by x.created_at desc)
                        from (select id, kind, to_email, status, attempts, last_error, created_at, sent_at, name
                              from f order by created_at desc
                              limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0))) x), '[]')));
end $$;

create function public.admin_retry_delivery(p_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.require_role('admin', 'owner');
  update public.deliveries set status = 'queued', attempts = 0, last_error = null, next_attempt_at = now()
   where id = p_id;
  perform public.audit('delivery_retry', p_id::text, null);
end $$;

create function public.admin_get_template(p_slug text, p_kind text) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_role('admin', 'owner');
  return (select json_build_object('forma_path', t.forma_path, 'width', t.width, 'height', t.height, 'layout', t.layout)
          from public.templates t where t.event_id = public.event_id_of(p_slug) and t.kind = p_kind);
end $$;

create function public.admin_save_template(p_slug text, p_kind text, p_forma_path text, p_width int, p_height int,
                                           p_layout jsonb) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := public.require_role('admin', 'owner'); v_event uuid := public.event_id_of(p_slug);
begin
  if p_kind not in ('card', 'certificate') then
    raise exception 'bad kind' using errcode = '22023';
  end if;
  insert into public.templates (event_id, kind, forma_path, width, height, layout, updated_by)
  values (v_event, p_kind, p_forma_path, p_width, p_height, p_layout, v_uid)
  on conflict (event_id, kind) do update set forma_path = excluded.forma_path, width = excluded.width,
    height = excluded.height, layout = excluded.layout, updated_at = now(), updated_by = excluded.updated_by;
  perform public.release_deliveries(v_event, p_kind);
  perform public.audit('template_save', p_kind, jsonb_build_object('forma_path', p_forma_path));
end $$;

create function public.admin_export(p_slug text) returns json
language plpgsql stable security definer set search_path = '' as $$
declare v_event uuid := public.event_id_of(p_slug);
begin
  perform public.require_role('admin', 'owner');
  return json_build_object(
    'guests', coalesce((select json_agg(to_json(x) order by x.created_at)
                        from (select id, serial, full_name, phone, email, gender, guest_type, workplace, specialization,
                                     lang, is_vip, created_at from public.guests where event_id = v_event) x), '[]'),
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

-- ---------- owner ----------
create function public.owner_list_staff() returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_role('owner');
  return coalesce((select json_agg(json_build_object('user_id', user_id, 'email', email, 'role', role,
                                                     'display_name', display_name, 'active', active) order by role, email)
                   from public.staff), '[]');
end $$;

create function public.owner_set_staff(p_user_id uuid, p_role text, p_active boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := public.require_role('owner');
begin
  if p_user_id = v_uid then
    raise exception 'cannot change your own account' using errcode = '22023';
  end if;
  if p_role not in ('admin', 'doctor') then
    raise exception 'role must be admin or doctor' using errcode = '22023';
  end if;
  if exists (select 1 from public.staff where user_id = p_user_id and role = 'owner') then
    raise exception 'cannot change the owner' using errcode = '22023';
  end if;
  update public.staff set role = p_role, active = p_active where user_id = p_user_id;
  perform public.audit('staff_update', p_user_id::text, jsonb_build_object('role', p_role, 'active', p_active));
end $$;

create function public.owner_audit(p_limit int, p_offset int) returns json
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_role('owner');
  return json_build_object(
    'total', (select count(*) from public.audit_log),
    'rows', coalesce((select json_agg(to_json(x) order by x.id desc)
                      from (select a.id, a.at, s.email as actor_email, a.action, a.target, a.details
                            from public.audit_log a left join public.staff s on s.user_id = a.actor
                            order by a.id desc
                            limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0))) x), '[]'));
end $$;

-- One-off: run in the SQL editor after the owner's account exists. Does nothing if an owner exists.
create function public.bootstrap_owner(p_email text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid;
begin
  if exists (select 1 from public.staff where role = 'owner') then
    return 'owner already exists';
  end if;
  select id into v_id from auth.users where lower(email) = lower(btrim(p_email));
  if v_id is null then
    return 'no auth user with that email';
  end if;
  insert into public.staff (user_id, email, role, display_name)
  values (v_id, lower(btrim(p_email)), 'owner', 'Owner')
  on conflict (user_id) do update set role = 'owner', active = true;
  insert into public.audit_log (actor, action, target) values (v_id, 'bootstrap_owner', lower(btrim(p_email)));
  return 'ok';
end $$;

-- Called by api/staff.py with the service role after Supabase sends the invite.
create function public.service_add_staff(p_user_id uuid, p_email text, p_role text, p_display_name text,
                                         p_created_by uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_role not in ('admin', 'doctor') then
    raise exception 'role must be admin or doctor' using errcode = '22023';
  end if;
  insert into public.staff (user_id, email, role, display_name, created_by)
  values (p_user_id, lower(btrim(p_email)), p_role, nullif(btrim(p_display_name), ''), p_created_by)
  on conflict (user_id) do update set role = excluded.role, active = true,
    display_name = coalesce(excluded.display_name, public.staff.display_name)
  where public.staff.role <> 'owner';
  insert into public.audit_log (actor, action, target, details)
  values (p_created_by, 'staff_invite', lower(btrim(p_email)), jsonb_build_object('role', p_role));
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.whoami() to authenticated;
grant execute on function public.get_public_event(text) to anon, authenticated;
grant execute on function public.register_guest(text, text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.checkin_guest(text, text, text) to anon, authenticated;
grant execute on function public.get_display_counts(text) to anon, authenticated;
grant execute on function public.search_researchers(text, text) to authenticated;
grant execute on function public.sign_off_researcher(uuid, text, text, text, text) to authenticated;
grant execute on function public.storage_can_write_signature(text) to authenticated;
grant execute on function public.storage_is_admin() to authenticated;
grant execute on function public.storage_is_owner() to authenticated;
grant execute on function
  public.admin_overview(text), public.admin_list_guests(text, text, int, int), public.admin_update_guest(uuid, jsonb),
  public.admin_delete_guest(uuid), public.admin_import_researchers(text, jsonb),
  public.admin_list_researchers(text, text, int, int), public.admin_set_vip(text, uuid, boolean),
  public.admin_set_switches(text, boolean, boolean, boolean), public.admin_list_deliveries(text, text, int, int),
  public.admin_retry_delivery(uuid), public.admin_get_template(text, text),
  public.admin_save_template(text, text, text, int, int, jsonb), public.admin_export(text),
  public.owner_list_staff(), public.owner_set_staff(uuid, text, boolean), public.owner_audit(int, int)
  to authenticated;
revoke execute on function public.bootstrap_owner(text) from service_role;
grant execute on function public.service_add_staff(uuid, text, text, text, uuid) to service_role;
