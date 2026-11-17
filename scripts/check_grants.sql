-- Who can call which database function. Run in the Supabase SQL editor before going live.
-- Expected:
--   anon          -> checkin_guest, get_display_counts, get_public_event, register_guest
--   authenticated -> admin_* / owner_* (they check the role inside), search_researchers,
--                    sign_off_researcher, storage_* helpers, whoami, and the anon four
select r.rolname, string_agg(p.proname, ', ' order by p.proname) as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated')) r(rolname)
where n.nspname = 'public' and has_function_privilege(r.rolname, p.oid, 'execute')
group by r.rolname
order by r.rolname;
