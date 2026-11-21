-- Admins add one researcher by hand from the dashboard (owner, 21 Nov): name and research title required;
-- paper ID, hall, phone, email and institution optional.
create function public.admin_add_researcher(p_slug text, p_row jsonb) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_event uuid := public.event_id_of(p_slug);
  v_name text := btrim(coalesce(p_row ->> 'name_ar', ''));
  v_title text := btrim(coalesce(p_row ->> 'research_title', ''));
  v_email text := nullif(lower(btrim(coalesce(p_row ->> 'email', ''))), '');
  v_id uuid;
begin
  perform public.require_role('admin', 'owner');
  if v_name = '' then raise exception 'name is required' using errcode = '22023'; end if;
  if v_title = '' then raise exception 'research title is required' using errcode = '22023'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'bad email' using errcode = '22023';
  end if;
  insert into public.researchers (event_id, name_ar, email, phone, institution, research_title, paper_code, hall)
  values (v_event, v_name, v_email, nullif(btrim(coalesce(p_row ->> 'phone', '')), ''),
          nullif(btrim(coalesce(p_row ->> 'institution', '')), ''), v_title,
          nullif(upper(btrim(coalesce(p_row ->> 'paper_code', ''))), ''), nullif(btrim(coalesce(p_row ->> 'hall', '')), ''))
  returning id into v_id;
  perform public.audit('researcher_add', v_id::text, jsonb_build_object('name', v_name));
  return json_build_object('id', v_id);
end $$;
revoke all on function public.admin_add_researcher(text, jsonb) from public, anon;
grant execute on function public.admin_add_researcher(text, jsonb) to authenticated;
