-- Guests registered before certificates were sent on registration (17 Nov) get theirs at their next check-in.
-- The unique (kind, guest_id) keeps it to one per guest.
create function public.checkins_queue_certificate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.deliveries (event_id, kind, guest_id, to_email, lang, status)
  select g.event_id, 'certificate', g.id, g.email, g.lang, public.delivery_initial_status(g.event_id, 'certificate')
    from public.guests g where g.id = new.guest_id
  on conflict do nothing;
  return null;
end $$;
create trigger checkins_queue_certificate after insert on public.guest_checkins
  for each row execute function public.checkins_queue_certificate();
revoke execute on function public.checkins_queue_certificate() from public, anon, authenticated;
