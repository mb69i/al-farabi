-- Hall screen day/night mode, chosen by an admin (Admin → Controls): 'auto' (night 18:00–06:00
-- Baghdad time), 'day' or 'night'. The hall screen already polls get_display_counts every few
-- seconds, so the mode rides along with the numbers and a change shows within one poll.

insert into public.site_settings (key, value) values ('display_theme', to_jsonb('auto'::text))
on conflict (key) do nothing;

create or replace function public.get_display_counts(p_slug text) returns json
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
    'researchers_total', (select count(distinct lower(r.email)) from public.researchers r where r.event_id = (select id from ev)),
    'theme', coalesce((select value #>> '{}' from public.site_settings where key = 'display_theme'), 'auto'))
$$;

create function public.admin_set_display_theme(p_theme text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_role('admin', 'owner');
begin
  if p_theme is null or p_theme not in ('auto', 'day', 'night') then
    raise exception 'invalid theme' using errcode = '22023';
  end if;
  insert into public.site_settings (key, value, updated_at, updated_by) values ('display_theme', to_jsonb(p_theme), now(), v_uid)
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = v_uid;
  perform public.audit('display_theme', 'display', jsonb_build_object('theme', p_theme));
  return p_theme;
end $$;

revoke execute on function public.admin_set_display_theme(text) from public, anon;
grant execute on function public.admin_set_display_theme(text) to authenticated;
grant execute on function public.get_display_counts(text) to anon, authenticated;
