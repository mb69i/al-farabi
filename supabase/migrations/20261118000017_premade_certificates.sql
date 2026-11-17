-- Pre-made certificates. The Chromium engine (certs/) draws each certificate on the laptop and stores the PDF
-- in the private 'outputs' bucket; the Vercel sender then emails that file as is instead of drawing it.
-- Also: certificates for attendees (guests) get the guest's name in the email; researchers keep theirs.

alter table public.deliveries add column prerendered_path text
  check (prerendered_path is null
         or (prerendered_path ~ '^[A-Za-z0-9_-]+(/[A-Za-z0-9_-]+)*/[A-Za-z0-9_-]+\.pdf$'));

create or replace function public.delivery_context(p_id uuid) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'kind', d.kind,
    'lang', d.lang,
    'to_email', coalesce(g.email, r.email, d.to_email),
    'prerendered', d.prerendered_path,
    'values', case
      when d.kind = 'card' then
        json_build_object('full_name', g.full_name, 'serial', g.serial,
                          'event_name', case when d.lang = 'en' then e.name_en else e.name_ar end)
      when d.guest_id is not null then
        json_build_object('full_name', g.full_name, 'institution', g.workplace,
                          'event_name', case when d.lang = 'en' then e.name_en else e.name_ar end)
      else
        json_build_object('full_name', case when d.lang = 'en' and r.name_en is not null then r.name_en else r.name_ar end,
                          'research_title', r.research_title, 'institution', coalesce(r.institution, ''),
                          'event_name', case when d.lang = 'en' then e.name_en else e.name_ar end)
      end,
    'template', (select json_build_object('forma_path', t.forma_path, 'width', t.width, 'height', t.height, 'layout', t.layout)
                 from public.templates t where t.event_id = d.event_id and t.kind = d.kind))
  from public.deliveries d
  join public.events e on e.id = d.event_id
  left join public.guests g on g.id = d.guest_id
  left join public.researchers r on r.id = d.researcher_id
  where d.id = p_id
$$;

revoke execute on function public.delivery_context(uuid) from public, anon, authenticated;
grant execute on function public.delivery_context(uuid) to service_role;
