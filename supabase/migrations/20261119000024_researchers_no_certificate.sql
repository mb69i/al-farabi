-- Researchers get no emailed certificate (owner, 19 Nov): when they sign they get a card, and a printed
-- certificate after the conference. Signing records the signature only; switching certificates on in the
-- dashboard releases guest certificates only, never an old researcher one. Guests are unchanged.

create or replace function public.sign_off_researcher(
  p_researcher_id uuid, p_signature_path text, p_strokes_path text, p_sig_sha256 text, p_device text)
returns json
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_role('doctor', 'admin', 'owner');
  r public.researchers;
  v_prefix text;
  v_signed timestamptz;
begin
  select * into r from public.researchers where id = p_researcher_id;
  if r.id is null then
    raise exception 'researcher not found' using errcode = '22023';
  end if;
  v_prefix := 'signatures/' || r.event_id || '/' || r.id || '/';
  if p_signature_path is null or left(p_signature_path, char_length(v_prefix)) <> v_prefix
     or p_strokes_path is null or left(p_strokes_path, char_length(v_prefix)) <> v_prefix
     or p_signature_path like '%..%' or p_strokes_path like '%..%' then
    raise exception 'bad signature path' using errcode = '22023';
  end if;
  if coalesce(p_sig_sha256, '') !~ '^[0-9a-f]{64}$' then
    raise exception 'bad signature hash' using errcode = '22023';
  end if;

  insert into public.researcher_signoffs (researcher_id, day, signature_path, strokes_path, sig_sha256, doctor_id, device)
  values (r.id, public.baghdad_today(), p_signature_path, p_strokes_path, p_sig_sha256, v_uid, left(p_device, 200))
  on conflict (researcher_id) do nothing
  returning signed_at into v_signed;

  if v_signed is null then
    select signed_at into v_signed from public.researcher_signoffs where researcher_id = r.id;
    return json_build_object('status', 'already_signed', 'signed_at', v_signed);
  end if;

  perform public.audit('sign_off', r.id::text, json_build_object('doctor', v_uid)::jsonb);
  return json_build_object('status', 'signed', 'signed_at', v_signed);
end $$;

create or replace function public.release_deliveries(p_event_id uuid, p_kind text) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  if public.delivery_initial_status(p_event_id, p_kind) <> 'queued' then
    return 0;
  end if;
  update public.deliveries
     set status = 'queued', next_attempt_at = now()
   where event_id = p_event_id and kind = p_kind and status in ('disabled', 'waiting_template')
     and researcher_id is null; -- researchers get a printed certificate, never an email one
  get diagnostics n = row_count;
  return n;
end $$;
