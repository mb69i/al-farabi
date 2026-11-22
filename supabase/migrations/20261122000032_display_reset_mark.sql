-- Hall screen reset without deleting (owner, 22 Nov): numbers count today's arrivals after the
-- 'display_counts_since' time (site_settings); every record stays in the database.
create or replace function public.get_display_counts(p_slug text) returns json
language sql stable security definer set search_path = '' as $$
  with ev as (select id from public.events where slug = p_slug),
  since as (
    select greatest(
      (public.baghdad_today()::timestamp at time zone 'Asia/Baghdad'),
      coalesce((select (value #>> '{}')::timestamptz from public.site_settings where key = 'display_counts_since'),
               '-infinity'::timestamptz)) as t
  ),
  today as (
    select g.gender, g.is_vip, g.created_at >= (select t from since) as is_new
    from public.guest_checkins c
    join public.guests g on g.id = c.guest_id and g.event_id = (select id from ev)
    where c.day = public.baghdad_today() and c.at >= (select t from since)
  )
  select json_build_object(
    'total', (select count(*) from today where is_new),
    'present_today', (select count(*) from today),
    'male', (select count(*) from today where gender = 'male'),
    'female', (select count(*) from today where gender = 'female'),
    'vip', (select count(*) from today where is_vip),
    'researchers_signed', (select count(distinct lower(r.email)) from public.researchers r
                           join public.researcher_signoffs s on s.researcher_id = r.id
                           where r.event_id = (select id from ev) and s.day = public.baghdad_today()
                             and s.signed_at >= (select t from since)),
    'researchers_total', (select count(distinct lower(r.email)) from public.researchers r where r.event_id = (select id from ev)),
    'theme', coalesce((select value #>> '{}' from public.site_settings where key = 'display_theme'), 'auto'))
$$;
