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
| 6 | Faster loading on phones/mobile data | To do |
| 7 | More animated/interactive hall screen counter (`/display`) | To do |
| 8 | Public `/verify?s=SERIAL` page + read-only `verify_certificate(serial)` (name, event, date, role only), rate-limited; consider longer printed serials | To do |
| 9 | Certificate engine from the owner's `engine-template` folder (template.html with {{NAME}}, {{ORG_LINE}}, {{DATE_PHRASE}}, {{SERIAL}}, {{QR}}, {{VARIANT}}); Playwright/Chromium render; flat 300 dpi PDF; fresh per-person QR to `<VERIFY_BASE_URL>/verify?s=<serial>` verified by decoding; fail on missing name/date/URL; sponsors and no-sponsors variants; show samples (short/long name, one-day/multi-day date) first | To do — **needs the owner's engine-template folder** |

## Open decisions for the owner
- Shared admin/data-entry token: not added to the live login (personal logins + authenticator are stronger; see SECURITY.md §3).
- Schedule the 5-minute backup task (command in BACKUP.md).
- Email (Resend domain + Vercel secret settings) is still not set up, so cards/certificates are not emailed.
