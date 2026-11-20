-- Up to 6 email senders at once (load test, 20 Nov): with one sender drawing 3 certificates per round,
-- 500 registrations went out at only 3-7 a minute. Each sender now takes one of 6 slots (engine/jobs.py SLOTS),
-- and the wake-up (on every new email and every minute) starts one sender per 6 waiting emails, up to the
-- free slots. The old single lease (acquire_runner/release_runner) stays for the code still deployed until
-- this version is live.

create table public.runner_slots (
  slot int primary key check (slot between 1 and 6),
  expires_at timestamptz not null default now() - interval '1 second'
);
insert into public.runner_slots (slot) select generate_series(1, 6);
alter table public.runner_slots enable row level security; -- no policies: service role only

-- A free slot (or null): never the same slot to two senders; an expired slot (a sender that died) is free again.
create function public.acquire_runner_slot(p_ttl_seconds int, p_slots int) returns int
language sql volatile security definer set search_path = '' as $$
  with free as (
    select slot from public.runner_slots
     where slot <= greatest(1, least(coalesce(p_slots, 1), 6)) and expires_at < now()
     order by slot limit 1
     for update skip locked)
  update public.runner_slots r set expires_at = now() + make_interval(secs => greatest(10, least(p_ttl_seconds, 300)))
    from free where r.slot = free.slot
  returning r.slot
$$;

create function public.release_runner_slot(p_slot int) returns void
language sql volatile security definer set search_path = '' as $$
  update public.runner_slots set expires_at = now() - interval '1 second' where slot = p_slot
$$;

-- How many senders to start now: one per 6 emails ready to go (as claim_deliveries counts them), at least one
-- when anything waits, never more than the free slots.
create function public.runners_wanted() returns int
language sql stable security definer set search_path = '' as $$
  with ready as (
    select count(*) n from public.deliveries d join public.events e on e.id = d.event_id
     where d.status = 'queued' and d.next_attempt_at <= now()
       and case d.kind when 'card' then e.cards_enabled else e.certificates_enabled end)
  select least(ceil((select n from ready) / 6.0)::int,
               (select count(*)::int from public.runner_slots where expires_at < now()))
$$;

-- Wakes as many senders as runners_wanted() says (at least one call when nothing is counted, as before,
-- so a waiting row of another kind is never stranded).
create or replace function public.kick_delivery_runner() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_url text; v_secret text; v_n int;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'deliver_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'delivery_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  v_n := greatest(1, coalesce(public.runners_wanted(), 1));
  for i in 1..v_n loop
    perform net.http_post(
      url := v_url,
      body := '{}'::jsonb,
      headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
      timeout_milliseconds := 2000);
  end loop;
end $$;

revoke execute on function public.acquire_runner_slot(int, int), public.release_runner_slot(int),
  public.runners_wanted() from public, anon, authenticated;
grant execute on function public.acquire_runner_slot(int, int), public.release_runner_slot(int),
  public.runners_wanted() to service_role;
revoke execute on function public.kick_delivery_runner() from public, anon, authenticated;
