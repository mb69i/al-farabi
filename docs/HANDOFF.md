# Handover — where things stand (17 Nov 2026)

Event: Al-Farabi conference, **21–22 Nov 2026**. Live site: **https://al-farabi-gilt.vercel.app** (branch `main`).
Repo: `D:\antigravity\alfarabi-conference` → GitHub `mb69i/al-farabi`. Supabase project `kxwimaslalczappzngci`
(changed through the Supabase connector; migrations in `supabase/migrations/`, DB tests in `tests/db/*.sql`,
each runs inside BEGIN…ROLLBACK).

## Rules the owner set
- After every round of work: secret scan → commit → push to **`preview/updates`** (private Vercel preview).
  Push to `main` (live) only when the owner says so.
- Phone-size screenshots after every visual change:
  `PLAYWRIGHT_BROWSERS_PATH=D:\antigravity\.pw-browsers node scripts/phone-shot.mjs <scenario> <out.png> [baseUrl]`
  (scenarios: form, busy, thanks, footer, login, researchers, admin, controls, display; dev server
  `npx vite --port 5175 --host 127.0.0.1`).
- Never change Supabase keys without asking. Never create accounts or set passwords (owner does that).
- Test first (failing test, then code). Suites: `npx vitest run` (106), `.venv/Scripts/python -m pytest tests/py` (71).

## Accounts
- Owner: malbaqr431@gmail.com (owner role restored with `bootstrap_owner` after the account was recreated;
  must enrol the authenticator again). Doctor: sina.quduri@alfarabiuc.edu.iq.
- Five demo researchers marked (تجريبي)/(Demo); remove with
  `delete from public.researchers where email like 'demo.%@example.org';`
- Backup laptop `laptop-1` = this PC (token in `%APPDATA%\alfarabi-backup`). Windows task not scheduled yet.

## The 9-item request (17 Nov afternoon)
| # | Item | Status |
|---|---|---|
| 1 | Security (old Registration-tool functions, review, rate limit, subdomain plan, attack checklist) | **Done** — `docs/SECURITY.md`; old repo fix committed locally on `security/lock-admin-crud` (not pushed) |
| 2 | Backups for 2 laptops + recovery steps | **Done** — `docs/BACKUP.md`, `scripts/backup.py`, `scripts/restore_sql.py` |
| 3 | Remove "Attending as" | **Done**, live |
| 4 | White page, blue glass cards, red borders, crest only, contrast | **Done**, live |
| 5 | Editable "Contact us" footer + credits | **Done**, live; phone/email still empty (owner fills in Admin → التحكم) |
| 6 | Faster loading on phones/mobile data | **Done** (preview) — registration page 1039 KB → 273 KB, fully loaded 6.0 s → 2.4 s on slow 4G; `scripts/check-bundle.mjs` (75 KB gzip budget), `scripts/perf-check.mjs` |
| 7 | More animated/interactive hall screen counter (`/display`) | **Done** (preview) — count-up, glow + "+N", "Welcome, guest no. N", last-registration time, Live badge, researcher progress, reduced-motion, F/double-click full screen |
| 8 | Public `/verify?s=SERIAL` page + read-only `verify_certificate(serial)` (name, event, date, role only), rate-limited; consider longer printed serials | **Done** (preview; migration 13 applied) — `certificates` table, serials `ALF26-XXXX-XXXX-XXXX`, `issue_certificate()` server-only, limits `verify_ip` 30/min, `verify_global` 3000/10 min; test `tests/db/verify.sql` |
| 9 | Certificate engine from the owner's `engine-template` folder (template.html with {{NAME}}, {{ORG_LINE}}, {{DATE_PHRASE}}, {{SERIAL}}, {{QR}}, {{VARIANT}}); Playwright/Chromium render; flat 300 dpi PDF; fresh per-person QR to `<VERIFY_BASE_URL>/verify?s=<serial>` verified by decoding; fail on missing name/date/URL; sponsors and no-sponsors variants; show samples (short/long name, one-day/multi-day date) first | **Samples ready on the owner's forma, waiting for approval** — `certs/` draws on `certs/forma/forma.pdf` (sent 17 Nov; sample text erased by `clean.py`, positions matched within ~1%). Chromium → 300 dpi PNG/JPEG + flat 1.4 MB PDF, QR decoded from the PNG and from the PDF's image, hard-fails on missing name/date/URL/serial, plain and sponsors variants. Runs on the laptop as a batch (see `certs/README.md`). Not yet wired into sending |

## Day/night (17 Nov night)
- Hall screen mode is set by an admin: Admin → التحكم → "شاشة القاعة" (Automatic / Day / Night), stored in
  `site_settings.display_theme` (migration 14, test `tests/db/display_theme.sql`), sent with `get_display_counts`.
- After any hall screen change run `node scripts/check-hall-fit.mjs` (18 window sizes, day and night: nothing cut off,
  centred, column ≤ 90% of the height).
- Every other page has a sun/moon button next to the language button (saved per device, `public/theme-boot.js`).
- If the hall screen says it is "not connected to the database", that Vercel environment is missing
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (check Settings → Environment Variables → Preview).

## Notes from items 6–8
- Public pages talk to the database through `src/lib/rpcFetch.ts` (no supabase-js); staff screens load
  `src/staffApp.tsx` on demand. Keep `npm run build && node scripts/check-bundle.mjs` passing.
- Fonts are self-hosted (`src/styles/fonts.css`); Google Fonts were removed from the CSP.
- Certificates are not yet in `backup_export` / `scripts/backup.py`: add them once item 9 issues real ones,
  so printed serials survive a restore.

## Open decisions for the owner
- Shared admin/data-entry token: not added to the live login (personal logins + authenticator are stronger; see SECURITY.md §3).
- Schedule the 5-minute backup task (command in BACKUP.md).
- Email (17 Nov, live): domain `mb-ai.org` (Cloudflare) has the Resend DKIM/SPF/DMARC records; sender defaults to
  `certificates@mb-ai.org`; the database vault holds the sender URL and secret. Still needed from the owner:
  Resend shows *Verified*, then `RESEND_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel. Until then nothing is sent
  or retried.
