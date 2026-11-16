-- Security advisor: keep the pg_net extension out of the exposed public schema.
-- Its functions live in schema "net" either way; kick_delivery_runner() calls net.http_post at run time.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
