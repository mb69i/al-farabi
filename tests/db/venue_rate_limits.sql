-- A whole hall registers from one WiFi address (owner, 27 Nov: "make sure we can handle 2000 users"): one address
-- may make 1,000 registration attempts in a minute, and the event 10,000 in ten minutes, and the brake still
-- holds beyond that. Rolled back.
begin;
do $$
declare ok int := 0; i int;
begin
  for i in 1..1000 loop
    if public.take_rate('register_ip', 'venue-wifi-test') then ok := ok + 1; end if;
  end loop;
  if ok <> 1000 then raise exception 'FAIL: only % of 1000 attempts from one address were allowed', ok; end if;
  if (select max_hits from public.rate_limits where name = 'register_global') < 10000 then
    raise exception 'FAIL: the event-wide limit is below 10,000 per 10 minutes';
  end if;
  -- still a brake: an address hammering far past a hall's worth is refused
  for i in 1..600 loop perform public.take_rate('register_ip', 'venue-wifi-test'); end loop;
  if public.take_rate('register_ip', 'venue-wifi-test') then raise exception 'FAIL: no limit at all any more'; end if;
  raise notice 'PASS venue_rate_limits';
end $$;
rollback;
