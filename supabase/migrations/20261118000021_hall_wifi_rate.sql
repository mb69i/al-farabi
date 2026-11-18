-- 500+ guests (owner, 18 Nov): a whole hall can share one Wi-Fi address, so allow up to 300 registrations
-- a minute from one address (was 120). The overall cap stays at 3000 per 10 minutes.
update public.rate_limits set max_hits = 300 where name = 'register_ip';
