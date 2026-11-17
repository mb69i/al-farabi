-- The sender's shared secret is kept only in the vault ('delivery_secret'). The Vercel sender asks
-- the database to check what it was given, so nobody has to copy the secret into Vercel.
-- Only the server key (service_role) may ask. Hashes are compared so timing reveals nothing useful.
create or replace function public.delivery_secret_ok(p_given text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_secret text;
begin
  if p_given is null or length(p_given) < 32 then
    return false;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'delivery_secret';
  if v_secret is null or length(v_secret) < 32 then
    return false;
  end if;
  return sha256(convert_to(p_given, 'UTF8')) = sha256(convert_to(v_secret, 'UTF8'));
end;
$$;

revoke all on function public.delivery_secret_ok(text) from public, anon, authenticated;
grant execute on function public.delivery_secret_ok(text) to service_role;
