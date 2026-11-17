# Security — review, setup and attack checklist

Live site: `al-farabi-gilt.vercel.app` (repo `mb69i/al-farabi`) · Database: Supabase `kxwimaslalczappzngci`

## 1. What was found and fixed

| Where | Problem | Status |
|---|---|---|
| Registration-tool repo, `006_admin_crud.sql` | `admin_delete_registration` / `admin_update_registration` callable by anyone with the public key, no caller check | **Fixed in code**: `007_lock_admin_crud.sql` drops them and adds token-checked versions (bcrypt-hashed tokens, revocable, audited). Test: `db/tests/007_lock_admin_crud_test.sql` passes. That project is paused; apply 007 before ever resuming it. |
| Live system, public form | No rate limit | **Fixed**: per network address 120/min, overall 3000/10 min (`rate_limits` table, tested). |
| Live system, `pg_net` in public schema | Advisor warning | **Fixed** earlier. |

## 2. Review of every function, grant and policy (live database)

- **Tables**: all have row-level security **on** with **no policies**, and `anon`/`authenticated` have **no table privileges**. Nobody reads or writes tables directly.
- **Anonymous (public key) can run exactly 4 functions**: `get_public_event`, `register_guest`, `checkin_guest`, `get_display_counts`. Check any time with `scripts/check_grants.sql`.
- **Signed-in staff** can call `admin_*` / `owner_*` / `search_researchers` / `sign_off_researcher`, but every one of them checks the role inside the database, and admin/owner functions also require the authenticator code (aal2). A doctor or a stolen password without the phone gets nothing.
- **Service role only**: the email queue functions.
- **Owner setup** (`bootstrap_owner`): SQL editor only, works once.
- **Storage**: signatures private (doctors upload into the researcher's own folder only; admins read; only the owner deletes; nobody overwrites). Templates: admins only. Outputs: server only.
- **Browser bundle** contains only the public URL and publishable key; no secrets.

## 3. "Token for data entry and admin access"

The live system already uses **one personal login per person** instead of a shared token:

| Person | How they get in |
|---|---|
| Admin / owner | email + password + **authenticator code** (TOTP) |
| Doctor (data entry) | email + password; can only reach researcher sign-off |

Why not a shared token: a shared token leaks with one screenshot, can't be removed from one person without changing it for everyone, and the audit log can't say who did what. Personal logins can be switched off one by one (Admin → Staff) and every admin action is logged with the person's email.
The token pattern **is** used in the old Registration-tool fix (`007`), because that system has no logins.

## 4. Subdomain plan (hide the Vercel / main addresses)

Goal: guests only ever see e.g. **`register.alfarabiuc.edu.iq`**; the main university site and the `vercel.app` address stay out of sight.

1. Vercel → project **al-farabi** → Settings → **Domains** → add `register.alfarabiuc.edu.iq`.
2. University IT adds one DNS record: `register` **CNAME** `cname.vercel-dns.com` (Vercel shows the exact value).
3. Vercel issues the HTTPS certificate automatically (minutes).
4. In Vercel Domains, set the new domain as primary and make `al-farabi-gilt.vercel.app` **redirect** to it.
5. Supabase → Authentication → URL Configuration → **Site URL** = `https://register.alfarabiuc.edu.iq`.
6. Print the QR codes only after step 4 (the hall screen shows whatever address it is opened on).

Notes: the main domain `alfarabiuc.edu.iq` is untouched; only one subdomain record points to Vercel. The Supabase address (`*.supabase.co`) is still visible to technical users in the browser; hiding it needs Supabase's paid custom-domain add-on and is not needed for security (all access is checked in the database).

## 5. Form hardening now in place

- **Validation twice**: in the browser and again in the database (lengths, phone format incl. foreign numbers, email format, allowed values). The database is the one that counts.
- **Rate limits** in the database (cannot be bypassed by calling the API directly):
  - per network address: 120 per minute (a full hall on one campus Wi-Fi fits under this)
  - overall: 3000 per 10 minutes
  - refused calls do not use the overall budget, so one attacker cannot block everyone
  - only hashes of addresses are stored
- **Bot trap**: a hidden field bots fill in; such submissions are silently ignored.
- **Duplicates**: one registration per phone and per email.
- **Security headers**: HTTPS only, no framing, strict content policy.

Optional extra (not done, needs new keys → ask first): Cloudflare Turnstile (invisible challenge).

## 6. Checklist: suspected attack

Do these in order; stop when the problem stops.

1. **Stop new registrations**: Admin → **التحكم / Controls** → Registration open **OFF**. Takes effect instantly. (Check-ins also stop.)
2. **Stop emails** if fake registrations are triggering them: same page → cards / certificates **OFF**. Queued emails are held, not lost.
3. **Look**: Admin → Guests (many similar names, one email domain, many at the same minute?). Admin → Overview counters.
4. **Tighten the limits** (SQL Editor), e.g. 20 per minute per address:
   ```sql
   update public.rate_limits set max_hits = 20 where name = 'register_ip';
   ```
   Back to normal: `max_hits = 120`.
5. **Vercel**: project → Firewall → turn on **Attack Challenge Mode** (shows a browser check to every visitor until you turn it off).
6. **Suspect a staff account?** Admin → **Staff** → untick **Active** for that person (instant), and change their password in Supabase → Authentication → Users.
7. **Check what admins did**: Admin → **Audit log** (who, what, when).
8. **Take a backup now** (see `docs/BACKUP.md`).
9. **Clean up** fake rows after the attack, e.g. everything between two times:
   ```sql
   delete from public.guests
   where created_at between '2026-11-21 09:10+03' and '2026-11-21 09:25+03'
     and email like '%@spam-domain.example';
   ```
   (Always run the same `where` with `select count(*)` first.)
10. **Keys** (only if you believe the secret key leaked): Supabase → API Keys → roll the **secret** key, then update it in Vercel and redeploy. The publishable key is public by design; rolling it is not needed for an attack on the form.
11. Re-open registration and turn emails back on.
