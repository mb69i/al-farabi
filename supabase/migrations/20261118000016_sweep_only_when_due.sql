-- The one-minute sweep wakes the Vercel sender only when a delivery is actually due,
-- instead of 1,440 empty calls a day.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'deliver-sweep'),
  command := $cmd$select public.kick_delivery_runner() where exists (select 1 from public.deliveries where status = 'queued' and next_attempt_at <= now())$cmd$
);
