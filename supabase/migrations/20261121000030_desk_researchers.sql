-- The signing desk keeps every researcher on the phone so name and paper searches answer at once (owner, 21 Nov:
-- search felt slow). Only names, paper ID, hall and a search key built from those; phone and email searches
-- still go through search_researchers.
create function public.desk_researchers(p_slug text)
returns table (id uuid, name_ar text, name_en text, institution text, research_title text, signed boolean,
               paper_code text, hall text, key text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_role('doctor', 'admin', 'owner');
  return query
    select r.id, r.name_ar, r.name_en, r.institution, r.research_title,
           exists (select 1 from public.researcher_signoffs s where s.researcher_id = r.id),
           r.paper_code, r.hall,
           public.researcher_query(r.name_ar || ' ' || coalesce(r.name_en, '') || ' ' || coalesce(r.paper_code, '')
                                   || ' ' || coalesce(r.hall, ''))
    from public.researchers r
    join public.events e on e.id = r.event_id and e.slug = p_slug;
end $$;
revoke all on function public.desk_researchers(text) from public, anon;
grant execute on function public.desk_researchers(text) to authenticated;
