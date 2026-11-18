-- Registration needs the three-part name (first, father, grandfather), checked in the database too. Rolled back.
begin;
alter table public.guests disable trigger guests_queue_certificate; -- no certificate jobs from this test
update public.events set registration_open = true where slug = 'alfarabi-conf-2026';
do $$ declare r json; begin
  if public.name_word_count('علي حسن كريم') <> 3 or public.name_word_count('  Ali   Hasan  ') <> 2
     or public.name_word_count('Dr. Ali Hasan') <> 2 or public.name_word_count('د. علي حسن') <> 2
     or public.name_word_count('Ali H Kareem') <> 2 or public.name_word_count('عبد الله محمد علي') <> 4 then
    raise exception 'FAIL: name_word_count';
  end if;
  foreach r in array array[
    public.register_guest('alfarabi-conf-2026', 'Ali Hasan', '+9647700007001', 'n1@test.local', 'male', 'visitor', 'UoB', 'CS', 'en'),
    public.register_guest('alfarabi-conf-2026', 'د. علي حسن', '+9647700007002', 'n2@test.local', 'male', 'visitor', 'UoB', 'CS', 'ar')]
  loop
    if r->>'status' <> 'invalid' or r->>'field' <> 'full_name' then raise exception 'FAIL: two names accepted -> %', r; end if;
  end loop;
  r := public.register_guest('alfarabi-conf-2026', 'علي حسن كريم', '+9647700007003', 'n3@test.local', 'male', 'visitor', 'UoB', 'CS', 'ar');
  if r->>'status' <> 'created' then raise exception 'FAIL: three names refused -> %', r; end if;
end $$;
rollback;
select 'three_names.sql: all assertions passed' as result;
