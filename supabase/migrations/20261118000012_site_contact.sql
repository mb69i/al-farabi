-- Footer "Contact us" block: public to read, only admins (with the authenticator code) change it.
create table public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;

insert into public.site_settings (key, value) values ('contact', jsonb_build_object(
  'phone', '', 'email', '',
  'location_ar', 'جامعة الفارابي — بغداد',
  'location_en', 'Al-Farabi University — Baghdad'));

create function public.get_site_contact() returns json
language sql stable security definer set search_path = '' as $$
  select value::json from public.site_settings where key = 'contact'
$$;

create function public.admin_set_contact(p_phone text, p_email text, p_location_ar text, p_location_en text)
returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_role('admin', 'owner');
  v_phone text := btrim(coalesce(p_phone, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ar text := btrim(coalesce(p_location_ar, ''));
  v_en text := btrim(coalesce(p_location_en, ''));
  v_value jsonb;
begin
  if char_length(v_phone) > 25 or v_phone !~ '^[0-9+() -]*$' then
    raise exception 'invalid phone' using errcode = '22023';
  end if;
  if v_email <> '' and (char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  if char_length(v_ar) > 160 or char_length(v_en) > 160 then
    raise exception 'location too long' using errcode = '22023';
  end if;
  v_value := jsonb_build_object('phone', v_phone, 'email', v_email, 'location_ar', v_ar, 'location_en', v_en);
  insert into public.site_settings (key, value, updated_at, updated_by) values ('contact', v_value, now(), v_uid)
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = v_uid;
  perform public.audit('contact_update', 'contact', v_value);
  return v_value::json;
end $$;

revoke execute on function public.get_site_contact(), public.admin_set_contact(text, text, text, text) from public;
grant execute on function public.get_site_contact() to anon, authenticated;
grant execute on function public.admin_set_contact(text, text, text, text) to authenticated;
