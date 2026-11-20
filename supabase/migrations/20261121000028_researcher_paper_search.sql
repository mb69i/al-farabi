-- Researchers (owner, 21 Nov): each one carries the paper ID (ARCDT26-007) and the session hall (L_102, OL1) from
-- the agenda; the signing desk searches by name, phone number, paper ID or email; authors the accepted-papers
-- sheet lists without an email can still be signed in (no email is queued for them).

alter table public.researchers add column paper_code text, add column hall text;
alter table public.researchers alter column email drop not null;

-- Arabic-Indic digits typed on a phone keyboard count as 0-9.
create or replace function public.researcher_query(p text) returns text
language sql immutable set search_path = '' as $$
  select public.normalize_search(translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'))
$$;

-- +9647701234567 is also found as 9647701234567 and 07701234567.
create or replace function public.phone_search_forms(p text) returns text
language sql immutable set search_path = '' as $$
  select case when d = '' then ''
              when d like '964%' then d || ' 0' || substr(d, 4)
              else d end
  from (select regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g') as d) x
$$;

create or replace function public.researchers_search_key() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.search_key := public.researcher_query(
    new.name_ar || ' ' || coalesce(new.name_en, '') || ' ' || coalesce(new.email, '') || ' '
    || coalesce(new.paper_code, '') || ' ' || coalesce(new.hall, '')) || ' ' || public.phone_search_forms(new.phone);
  return new;
end $$;

drop trigger researchers_search_key on public.researchers;
create trigger researchers_search_key before insert or update of name_ar, name_en, email, phone, paper_code, hall
  on public.researchers for each row execute function public.researchers_search_key();
update public.researchers set name_ar = name_ar;

drop function public.search_researchers(text, text);
create function public.search_researchers(p_slug text, p_query text)
returns table (id uuid, name_ar text, name_en text, institution text, research_title text, signed boolean,
               paper_code text, hall text)
language plpgsql stable security definer set search_path = '' as $$
declare q text := public.researcher_query(p_query);
begin
  perform public.require_role('doctor', 'admin', 'owner');
  -- a phone number however it is typed: spaces, dashes, +964 or 00964 in front
  if q ~ '^[0-9+() -]+$' then
    q := regexp_replace(q, '[^0-9]', '', 'g');
    if q like '00964%' then q := '0' || substr(q, 6);
    elsif q like '964%' and char_length(q) > 9 then q := '0' || substr(q, 4);
    end if;
  end if;
  if char_length(q) < 2 then
    raise exception 'query too short' using errcode = '22023';
  end if;
  return query
    select r.id, r.name_ar, r.name_en, r.institution, r.research_title,
           exists (select 1 from public.researcher_signoffs s where s.researcher_id = r.id) as signed,
           r.paper_code, r.hall
    from public.researchers r
    join public.events e on e.id = r.event_id and e.slug = p_slug
    where r.search_key like '%' || q || '%'
    order by (lower(coalesce(r.paper_code, '')) like '%' || q) desc, 6, r.paper_code nulls last, r.name_ar
    limit 40;
end $$;
revoke all on function public.search_researchers(text, text) from public, anon;
grant execute on function public.search_researchers(text, text) to authenticated;

create or replace function public.sign_off_researcher(p_researcher_id uuid, p_signature_path text, p_strokes_path text,
                                                      p_sig_sha256 text, p_device text)
returns json
language plpgsql security definer set search_path = '' as $$
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

  -- the sign-in email (kind 'card'); none for an author with no email address
  if coalesce(r.email, '') <> '' then
    insert into public.deliveries (event_id, kind, researcher_id, to_email, lang, status)
    values (r.event_id, 'card', r.id, r.email, case when r.name_ar ~ '[؀-ۿ]' then 'ar' else 'en' end,
            public.researcher_card_status(r.event_id))
    on conflict do nothing;
  end if;
  perform public.audit('sign_off', r.id::text, json_build_object('doctor', v_uid)::jsonb);
  return json_build_object('status', 'signed', 'signed_at', v_signed);
end $$;
