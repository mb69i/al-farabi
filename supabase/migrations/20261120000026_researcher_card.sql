-- Researcher attendance card (owner, 20 Nov): when a doctor signs, the researcher is emailed a digital attendance
-- card at once (drawn by the site's Chromium function, certs/card.html); the paper certificate is handed over later.
-- Sent when "Send attendee cards" is on; no uploaded design is needed. Guests still get only their certificate
-- (their card rows keep needing a design, which does not exist). Researchers still never get an email certificate.

-- What goes on a researcher's card (the sender's drawing function asks for it by delivery id).
create function public.card_job(p_delivery_id uuid) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'name', case when d.lang = 'en' and r.name_en is not null then r.name_en else r.name_ar end,
    'org', coalesce(r.institution, ''),
    'title', r.research_title,
    'date_from', e.starts_on,
    'date_to', e.ends_on)
  from public.deliveries d
  join public.researchers r on r.id = d.researcher_id
  join public.events e on e.id = d.event_id
  where d.id = p_delivery_id and d.kind = 'card'
$$;

-- The sender needs to know a card is a researcher's ('role') and the researcher's values for the email.
create or replace function public.delivery_context(p_id uuid) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'kind', d.kind,
    'role', case when d.researcher_id is not null then 'researcher' else 'attendee' end,
    'lang', d.lang,
    'to_email', coalesce(g.email, r.email, d.to_email),
    'prerendered', d.prerendered_path,
    'values', case
      when d.kind = 'card' and d.guest_id is not null then
        json_build_object('full_name', g.full_name, 'serial', g.serial,
                          'event_name', case when d.lang = 'en' then e.name_en else e.name_ar end)
      when d.guest_id is not null then
        json_build_object('full_name', g.full_name, 'institution', g.workplace,
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

-- A researcher's card is ready as soon as cards are switched on (it needs no uploaded design).
create function public.researcher_card_status(p_event_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when e.cards_enabled then 'queued' else 'disabled' end from public.events e where e.id = p_event_id
$$;

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

  -- the digital attendance card, emailed at once (no certificate: that is handed over on paper later)
  insert into public.deliveries (event_id, kind, researcher_id, to_email, lang, status)
  values (r.event_id, 'card', r.id, r.email, case when r.name_ar ~ '[؀-ۿ]' then 'ar' else 'en' end,
          public.researcher_card_status(r.event_id))
  on conflict do nothing;
  perform public.audit('sign_off', r.id::text, json_build_object('doctor', v_uid)::jsonb);
  return json_build_object('status', 'signed', 'signed_at', v_signed);
end $$;

-- Switching cards on releases researchers' held cards (no design needed); researcher certificates never.
create or replace function public.release_deliveries(p_event_id uuid, p_kind text) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare n int := 0; m int := 0;
begin
  if public.delivery_initial_status(p_event_id, p_kind) = 'queued' then
    update public.deliveries
       set status = 'queued', next_attempt_at = now()
     where event_id = p_event_id and kind = p_kind and status in ('disabled', 'waiting_template')
       and researcher_id is null;
    get diagnostics n = row_count;
  end if;
  if p_kind = 'card' and public.researcher_card_status(p_event_id) = 'queued' then
    update public.deliveries
       set status = 'queued', next_attempt_at = now()
     where event_id = p_event_id and kind = 'card' and status in ('disabled', 'waiting_template')
       and researcher_id is not null;
    get diagnostics m = row_count;
  end if;
  return n + m;
end $$;

-- Researchers signed before this change (e.g. during the doctors' training) get their card now.
insert into public.deliveries (event_id, kind, researcher_id, to_email, lang, status)
select r.event_id, 'card', r.id, r.email, case when r.name_ar ~ '[؀-ۿ]' then 'ar' else 'en' end,
       public.researcher_card_status(r.event_id)
  from public.researchers r
  join public.researcher_signoffs s on s.researcher_id = r.id
on conflict do nothing;

revoke execute on function public.card_job(uuid), public.researcher_card_status(uuid) from public, anon, authenticated;
grant execute on function public.card_job(uuid) to service_role;
