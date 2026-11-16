-- Researcher search, idempotent sign-off, private signature/template/output storage.

create function public.researchers_search_key() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.search_key := public.normalize_search(new.name_ar || ' ' || coalesce(new.name_en, '') || ' ' || new.email);
  return new;
end $$;

create trigger researchers_search_key
before insert or update of name_ar, name_en, email on public.researchers
for each row execute function public.researchers_search_key();

create function public.search_researchers(p_slug text, p_query text)
returns table (id uuid, name_ar text, name_en text, institution text, research_title text, signed boolean)
language plpgsql stable security definer set search_path = '' as $$
declare q text := public.normalize_search(p_query);
begin
  perform public.require_role('doctor', 'admin', 'owner');
  if char_length(q) < 2 then
    raise exception 'query too short' using errcode = '22023';
  end if;
  return query
    select r.id, r.name_ar, r.name_en, r.institution, r.research_title,
           exists (select 1 from public.researcher_signoffs s where s.researcher_id = r.id) as signed
    from public.researchers r
    join public.events e on e.id = r.event_id and e.slug = p_slug
    where r.search_key like '%' || q || '%'
    order by 6, r.name_ar
    limit 25;
end $$;

create function public.sign_off_researcher(
  p_researcher_id uuid, p_signature_path text, p_strokes_path text, p_sig_sha256 text, p_device text)
returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_role('doctor', 'admin', 'owner');
  r public.researchers;
  v_prefix text;
  v_signed timestamptz;
  v_status text;
begin
  select * into r from public.researchers where id = p_researcher_id;
  if r.id is null then
    raise exception 'researcher not found' using errcode = '22023';
  end if;
  v_prefix := 'signatures/' || r.event_id || '/' || r.id || '/';
  if p_signature_path is null or left(p_signature_path, char_length(v_prefix)) <> v_prefix
     or p_strokes_path is null or left(p_strokes_path, char_length(v_prefix)) <> v_prefix
     or p_signature_path like '%..%' or p_strokes_path like '%..%' then
    raise exception 'bad signature path' using errcode = '22023';
  end if;
  if coalesce(p_sig_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'bad signature hash' using errcode = '22023';
  end if;

  insert into public.researcher_signoffs (researcher_id, day, signature_path, strokes_path, sig_sha256, doctor_id, device)
  values (r.id, public.baghdad_today(), p_signature_path, p_strokes_path, p_sig_sha256, v_uid, left(p_device, 200))
  on conflict (researcher_id) do nothing
  returning signed_at into v_signed;

  if v_signed is null then
    select signed_at into v_signed from public.researcher_signoffs where researcher_id = r.id;
    return json_build_object('status', 'already_signed', 'signed_at', v_signed);
  end if;

  v_status := public.delivery_initial_status(r.event_id, 'certificate');
  insert into public.deliveries (event_id, kind, researcher_id, to_email, lang, status)
  values (r.event_id, 'certificate', r.id, r.email,
          case when r.name_ar ~ '[؀-ۿ]' then 'ar' else 'en' end, v_status)
  on conflict do nothing;
  perform public.audit('sign_off', r.id::text, json_build_object('doctor', v_uid)::jsonb);

  return json_build_object('status', case when v_status = 'disabled' then 'certificates_paused' else 'signed' end,
                           'signed_at', v_signed);
end $$;

-- ---------- storage ----------
insert into storage.buckets (id, name, public) values
  ('signatures', 'signatures', false),
  ('templates', 'templates', false),
  ('outputs', 'outputs', false)
on conflict (id) do update set public = false;

-- Policy helpers (must be callable by signed-in users because policies run as them).
create function public.storage_can_write_signature(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.my_role() in ('doctor', 'admin', 'owner')
     and array_length(string_to_array(p_name, '/'), 1) = 3
     and exists (
       select 1 from public.researchers r
       where r.event_id::text = split_part(p_name, '/', 1) and r.id::text = split_part(p_name, '/', 2))
$$;

create function public.storage_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() in ('admin', 'owner'), false)
$$;

create function public.storage_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.my_role() = 'owner', false)
$$;

create policy "signatures: staff upload into researcher folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'signatures' and public.storage_can_write_signature(name));
create policy "signatures: admins read" on storage.objects
  for select to authenticated
  using (bucket_id = 'signatures' and public.storage_is_admin());
create policy "signatures: owner deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'signatures' and public.storage_is_owner());

create policy "templates: admins read" on storage.objects
  for select to authenticated using (bucket_id = 'templates' and public.storage_is_admin());
create policy "templates: admins upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'templates' and public.storage_is_admin());
create policy "templates: admins replace" on storage.objects
  for update to authenticated using (bucket_id = 'templates' and public.storage_is_admin());
create policy "templates: admins delete" on storage.objects
  for delete to authenticated using (bucket_id = 'templates' and public.storage_is_admin());

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
