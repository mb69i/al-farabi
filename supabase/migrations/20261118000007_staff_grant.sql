-- The owner gives an existing Supabase account (created in the dashboard) a staff role.
-- Needed because invitation emails require a custom SMTP sender.
create function public.owner_grant_staff_by_email(p_email text, p_role text, p_display_name text) returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_role('owner');
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_target uuid;
begin
  if p_role not in ('admin', 'doctor') then
    raise exception 'role must be admin or doctor' using errcode = '22023';
  end if;
  select id into v_target from auth.users where lower(email) = v_email;
  if v_target is null then
    return json_build_object('status', 'no_account');
  end if;
  if v_target = v_uid or exists (select 1 from public.staff where user_id = v_target and role = 'owner') then
    raise exception 'cannot change the owner' using errcode = '22023';
  end if;
  insert into public.staff (user_id, email, role, display_name, created_by)
  values (v_target, v_email, p_role, nullif(btrim(p_display_name), ''), v_uid)
  on conflict (user_id) do update set role = excluded.role, active = true, email = excluded.email,
    display_name = coalesce(excluded.display_name, public.staff.display_name);
  perform public.audit('staff_grant', v_email, jsonb_build_object('role', p_role));
  return json_build_object('status', 'ok', 'user_id', v_target);
end $$;

revoke execute on function public.owner_grant_staff_by_email(text, text, text) from public, anon;
grant execute on function public.owner_grant_staff_by_email(text, text, text) to authenticated;
