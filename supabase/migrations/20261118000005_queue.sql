-- Email delivery queue: safe claiming, backoff, single-runner lease, automatic kick.
-- Only the service role (the Vercel sender) may call these.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table public.runner_lease (
  id int primary key check (id = 1),
  expires_at timestamptz not null
);
insert into public.runner_lease (id, expires_at) values (1, '-infinity');
alter table public.runner_lease enable row level security;
revoke all on public.runner_lease from anon, authenticated;

create function public.claim_deliveries(p_limit int default 10) returns setof public.deliveries
language sql volatile security definer set search_path = '' as $$
  with c as (
    select id from public.deliveries
    where (status = 'queued' and next_attempt_at <= now())
       or (status = 'sending' and next_attempt_at <= now() - interval '5 minutes')
    order by next_attempt_at, created_at
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked)
  update public.deliveries d set status = 'sending', next_attempt_at = now()
  from c where d.id = c.id
  returning d.*
$$;

create function public.complete_delivery(p_id uuid, p_provider_id text, p_file_path text) returns void
language sql volatile security definer set search_path = '' as $$
  update public.deliveries
     set status = 'sent', sent_at = now(), provider_id = p_provider_id, file_path = p_file_path, last_error = null
   where id = p_id
$$;

-- Backoff after each failure: 1, 2, 5, 15, 60 minutes; the 6th failure is final.
create function public.fail_delivery(p_id uuid, p_error text) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  waits constant int[] := array[1, 2, 5, 15, 60];
  n int;
begin
  update public.deliveries set attempts = attempts + 1, last_error = left(p_error, 500)
   where id = p_id returning attempts into n;
  if n is null then
    return;
  end if;
  if n > array_length(waits, 1) then
    update public.deliveries set status = 'failed' where id = p_id;
  else
    update public.deliveries set status = 'queued', next_attempt_at = now() + make_interval(mins => waits[n])
     where id = p_id;
  end if;
end $$;

create function public.delivery_context(p_id uuid) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'kind', d.kind,
    'lang', d.lang,
    'to_email', d.to_email,
    'values', case when d.kind = 'card' then
        json_build_object('full_name', g.full_name, 'serial', g.serial,
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

create function public.acquire_runner(p_ttl_seconds int) returns boolean
language sql volatile security definer set search_path = '' as $$
  with taken as (
    update public.runner_lease set expires_at = now() + make_interval(secs => greatest(10, least(p_ttl_seconds, 300)))
     where id = 1 and expires_at < now()
    returning 1)
  select exists (select 1 from taken)
$$;

create function public.release_runner() returns void
language sql volatile security definer set search_path = '' as $$
  update public.runner_lease set expires_at = now() - interval '1 second' where id = 1
$$;

-- Wakes the Vercel sender. Needs vault secrets 'deliver_url' and 'delivery_secret'; without them it does nothing.
create function public.kick_delivery_runner() returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'deliver_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'delivery_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    timeout_milliseconds := 2000);
end $$;

create function public.deliveries_kick_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from new_rows where status = 'queued' and next_attempt_at <= now()) then
    perform public.kick_delivery_runner();
  end if;
  return null;
end $$;

create trigger deliveries_kick_insert after insert on public.deliveries
  referencing new table as new_rows for each statement execute function public.deliveries_kick_trigger();
create trigger deliveries_kick_update after update on public.deliveries
  referencing new table as new_rows for each statement execute function public.deliveries_kick_trigger();

select cron.schedule('deliver-sweep', '* * * * *', $$select public.kick_delivery_runner()$$);

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.whoami() to authenticated;
grant execute on function public.get_public_event(text) to anon, authenticated;
grant execute on function public.register_guest(text, text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.checkin_guest(text, text, text) to anon, authenticated;
grant execute on function public.get_display_counts(text) to anon, authenticated;
grant execute on function public.search_researchers(text, text) to authenticated;
grant execute on function public.sign_off_researcher(uuid, text, text, text, text) to authenticated;
grant execute on function public.storage_can_write_signature(text) to authenticated;
grant execute on function public.storage_is_admin() to authenticated;
grant execute on function public.storage_is_owner() to authenticated;
grant execute on function
  public.admin_overview(text), public.admin_list_guests(text, text, int, int), public.admin_update_guest(uuid, jsonb),
  public.admin_delete_guest(uuid), public.admin_import_researchers(text, jsonb),
  public.admin_list_researchers(text, text, int, int), public.admin_set_vip(text, uuid, boolean),
  public.admin_set_switches(text, boolean, boolean, boolean), public.admin_list_deliveries(text, text, int, int),
  public.admin_retry_delivery(uuid), public.admin_get_template(text, text),
  public.admin_save_template(text, text, text, int, int, jsonb), public.admin_export(text),
  public.owner_list_staff(), public.owner_set_staff(uuid, text, boolean), public.owner_audit(int, int)
  to authenticated;
grant execute on function public.service_add_staff(uuid, text, text, text, uuid) to service_role;
grant execute on function
  public.claim_deliveries(int), public.complete_delivery(uuid, text, text), public.fail_delivery(uuid, text),
  public.delivery_context(uuid), public.acquire_runner(int), public.release_runner()
  to service_role;
