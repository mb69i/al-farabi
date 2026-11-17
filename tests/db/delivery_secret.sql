-- The sender's shared secret lives only in the vault; Vercel asks the database to check it. Rolled back.
begin;
select vault.create_secret('TEST-DELIVERY-SECRET-0123456789abcdef', 'delivery_secret');

-- only the server key (service_role) may ask
do $$ begin
  if has_function_privilege('anon', 'public.delivery_secret_ok(text)', 'execute') then raise exception 'FAIL: anon can check'; end if;
  if has_function_privilege('authenticated', 'public.delivery_secret_ok(text)', 'execute') then raise exception 'FAIL: staff can check'; end if;
  if not has_function_privilege('service_role', 'public.delivery_secret_ok(text)', 'execute') then raise exception 'FAIL: server cannot check'; end if;
end $$;

set local role service_role;
do $$ begin
  if not public.delivery_secret_ok('TEST-DELIVERY-SECRET-0123456789abcdef') then raise exception 'FAIL: right secret refused'; end if;
  if public.delivery_secret_ok('TEST-DELIVERY-SECRET-0123456789abcdeX') then raise exception 'FAIL: wrong secret accepted'; end if;
  if public.delivery_secret_ok('') or public.delivery_secret_ok(null) then raise exception 'FAIL: empty accepted'; end if;
end $$;
reset role;

-- without a secret in the vault nothing is accepted
delete from vault.secrets where name = 'delivery_secret';
set local role service_role;
do $$ begin
  if public.delivery_secret_ok('') or public.delivery_secret_ok('anything') then raise exception 'FAIL: accepted with no secret'; end if;
end $$;
reset role;
select 'delivery_secret: all passed' as result;
rollback;
