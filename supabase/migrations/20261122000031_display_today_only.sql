-- Hall screen counts today only (owner, 22 Nov: "reset them all"): registered = new registrations attending today,
-- present = everyone attending today, male/female split today's attendees, researchers = signed today.
-- Yesterday's records stay in the database; the admin overview and exports still see everything.
create or replace function public.get_display_counts(p_slug text) returns json
language sql stable security definer set search_path = '' as $$
  with ev as (select id from public.events where slug = p_slug),
  today as (
    select g.gender, g.is_vip, (g.created_at at time zone 'Asia/Baghdad')::date = public.baghdad_today() as is_new
    from public.guest_checkins c
    join public.guests g on g.id = c.guest_id and g.event_id = (select id from ev)
    where c.day = public.baghdad_today()
  )
  select json_build_object(
    'total', (select count(*) from today where is_new),
    'present_today', (select count(*) from today),
    'male', (select count(*) from today where gender = 'male'),
    'female', (select count(*) from today where gender = 'female'),
    'vip', (select count(*) from today where is_vip),
    'researchers_signed', (select count(distinct lower(r.email)) from public.researchers r
                           join public.researcher_signoffs s on s.researcher_id = r.id
                           where r.event_id = (select id from ev) and s.day = public.baghdad_today()),
    'researchers_total', (select count(distinct lower(r.email)) from public.researchers r where r.event_id = (select id from ev)),
    'theme', coalesce((select value #>> '{}' from public.site_settings where key = 'display_theme'), 'auto'))
$$;
