-- TEDxBaghdad 2026 training event at Al-Farabi (owner, 26 Nov): registration + hall screen only,
-- no certificates and no emails. The date is a placeholder until the owner sends it:
--   update public.events set starts_on = 'YYYY-MM-DD', ends_on = 'YYYY-MM-DD' where slug = 'tedxbaghdad-2026';
insert into public.events (slug, name_ar, name_en, starts_on, ends_on, registration_open, cards_enabled, certificates_enabled)
values ('tedxbaghdad-2026',
        'تيداكس بغداد 2026 — ما لم نفقده يوماً',
        'TEDxBaghdad 2026 — What We Never Lost',
        '2026-12-19', '2026-12-19', true, false, false)
on conflict (slug) do nothing;
