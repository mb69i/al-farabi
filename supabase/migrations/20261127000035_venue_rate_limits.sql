-- Venue-sized registration limits (owner, 27 Nov: "make sure we can handle 2000 users"). A whole hall shares the
-- university WiFi's one public address, and phones on mobile data share carrier addresses, so 300 a minute per
-- address would turn people away. A load test (2,000 phones from one address in 33 s) ran at 61
-- registrations/s with p95 0.42 s, so the database has room; the limits stay a brake on abuse, at the size of the event.
update public.rate_limits set max_hits = 3000, window_seconds = 60 where name = 'register_ip';
update public.rate_limits set max_hits = 20000, window_seconds = 600 where name = 'register_global';
