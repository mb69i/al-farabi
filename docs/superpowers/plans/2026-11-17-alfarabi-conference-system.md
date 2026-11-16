# Al-Farabi Conference System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One secure system for the 21–22 Nov 2026 Al-Farabi conference: guest registration with a thank-you robot, a live hall screen, a doctor-only researcher sign-off page on tablets, emailed cards and certificates, and an owner-controlled admin dashboard.

**Architecture:**
- **Front end:** a React single-page app on Vercel. It talks to Supabase only through checked database functions; every table is locked by row-level security.
- **Cards and certificates:** made by a Python engine ported from `alfarabi-cert-engine` and running as Vercel Python functions. It takes jobs from a database queue and emails the files through Resend.
- **Triggering:** the database calls the engine when a job is queued (pg_net), and calls it again every minute (pg_cron) to retry anything left.

**Tech Stack:**
- Front end: React 18.3.1, Vite 5, TypeScript 5, react-router-dom 6, @supabase/supabase-js 2, signature_pad 5, qrcode 1.5.4, SheetJS 0.20.3 (from `cdn.sheetjs.com`, not the outdated npm `xlsx`)
- Tests: Vitest, @testing-library/react, Playwright, otplib (to pass the authenticator step in tests)
- Engine: Python 3.12 on Vercel with Pillow, arabic-reshaper, python-bidi, pypdfium2, requests, pytest
- Services: Supabase (Postgres, Auth with TOTP, Storage, pg_net, pg_cron) and Resend

**Spec:** `docs/superpowers/specs/2026-11-17-alfarabi-conference-design.md`

**New repo:** `D:\antigravity\alfarabi-conference`, pushed to the owner's GitHub. The repo starts fresh so that the old embedded keys and `frontend/volunteers_list.csv` don't carry over in its history.

**Schedule (today is 17 Nov):**
- Milestone A (Tasks 0–6): 18 Nov
- Milestone B (Tasks 7–9): 18–19 Nov
- Milestone C (Tasks 10–16): 19 Nov
- Milestone D (Task 17, rehearsal and freeze): 20 Nov

If time runs short, cut in this order:
1. Owner's audit-log viewer screen (the log is still written)
2. Template studio drag polish (typed coordinates still work)
3. Robot speech animation (the static robot stays)

## Global Constraints

- **Event:**
  - slug `alfarabi-conf-2026`
  - name_ar `مؤتمر الفارابي للبحوث التطبيقية في التحول الرقمي الشامل`
  - name_en `Al-Farabi Conference on Applied Research in Comprehensive Digital Transformation`
  - starts_on `2026-11-21`, ends_on `2026-11-22`
- **Timezone** for "today": `Asia/Baghdad`
- **Owner email:** `malbaqr431@gmail.com`
- **Colours:** navy `#14234B`, navy-deep `#0C1733`, burgundy `#A3262B`, gold `#F2C230` (accent only), white `#FFFFFF`
- **Fonts:** IBM Plex Sans Arabic and IBM Plex Sans (Google Fonts), weights 400/500/700
- **Phone:**
  - Iraqi local `07XXXXXXXXX` → `+9647XXXXXXXXX`
  - otherwise it must match `^\+[1-9]\d{7,14}$` after normalising
  - Arabic-Indic digits `٠-٩` and Persian digits `۰-۹` are converted
- **Serial format:** `ALF26-` + 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
- **Idle logout:** admin/owner 15 min, doctor 30 min
- **Retry backoff for email jobs:** attempt 1→1 min, 2→2 min, 3→5 min, 4→15 min, 5→60 min, then status `failed`
- **No secret in the browser bundle.** Allowed in front-end env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_EVENT_SLUG`. Server-only: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `DELIVERY_SECRET`, `MAIL_FROM`.
- **SQL functions:** every SQL function is `SECURITY DEFINER SET search_path = ''`. Each function is granted explicitly, and `EXECUTE` is revoked from `PUBLIC`.
- **UI direction:** RTL for Arabic and LTR for English, switched through `<html dir>`. The UI uses no emoji.

## Review Focus

1. **Foreign participants' phone numbers:** `+98…`, `+961…`, `+213…`, `+234…` and `+61…` must be accepted and stored as typed E.164. Pinned in Task 1 (`normalizePhone` tests) and Task 3 (`register_guest accepts international numbers`).
2. **Very long names and research titles** must stay inside their box: shrink to `min_size`, then wrap to at most `max_lines`, then end with an ellipsis. Pinned in Task 7 (`test_fit_text_wraps_long_title_within_box`, `test_render_long_arabic_name_stays_in_bounds`).
3. **Same guest on day 2, or tapping submit twice:**
   - exactly one guest row and one card job
   - one check-in row per day
   - pinned in Task 3 (`second registration same phone records checkin only`) and Task 11 (the submit button stays locked while a request is in flight)
4. **Tablet network drops during sign-off.** The upload is retried and `sign_off_researcher` is idempotent, so there's exactly one sign-off and one certificate job. Pinned in Task 4 (`sign_off twice returns already_signed and one delivery`) and Task 14 (`retries upload then calls RPC once`).
5. **Email service down, design missing, or switch off.** Jobs wait with a visible status and are released later. Two machines claiming at once never get the same job. Pinned in Task 6 (`concurrent claims never return the same row`), Task 5 (`release moves waiting_template to queued after template saved`) and Task 8 (`mailer failure calls fail_delivery with backoff`).

---

## Task 0: Accounts and settings (owner does this, Claude walks through it; no code)

**Start today.** Email domain checks (DNS) can take hours.

- [ ] **GitHub:** create a private repo `alfarabi-conference` under the owner's account.
- [ ] **Supabase:** create two projects, `alfarabi-conf-prod` and `alfarabi-conf-staging`. Region: Frankfurt (eu-central-1), the closest to Baghdad.
  - Auth → sign-ups **off**
  - MFA → TOTP **on**
  - minimum password length 12
  - JWT expiry 3600
- [ ] **Resend:**
  - create an account and add a domain the owner controls, for example `events.alfarabiuc.edu.iq`, with help from university IT
  - add the DNS records Resend shows and wait for "Verified"
  - choose a plan: the free tier allows only 100 emails a day, so pick **Pro for November**
- [ ] **Supabase Auth → SMTP:** use Resend's SMTP so invite and reset emails aren't limited to the built-in sender's handful per hour.
- [ ] **Vercel:** create a project linked to the GitHub repo. Set the env vars listed under Global Constraints for Production. Preview deployments get the staging values.
- [ ] **Owner account:**
  - in prod Supabase Auth → "Invite user" `malbaqr431@gmail.com` and set a password
  - after Task 5 is deployed, run `select public.bootstrap_owner('malbaqr431@gmail.com');` once in the SQL editor
- [ ] **Logos:** ask the university media office for the original crest and ministry seal files (SVG, AI or high-res PNG).

Done when the Resend domain shows Verified and both Supabase projects exist. The owner types keys into Vercel or a local `.env.local` themselves, never into chat.

---

## Milestone A — Database and security

### Task 1: Repo scaffold and shared normalisers

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `vercel.json`, `.gitignore`, `.env.example`, `requirements.txt`, `pytest.ini`
- Create: `src/lib/normalize.ts`
- Test: `src/lib/normalize.test.ts`

**Interfaces:**
- Produces:
  - `normalizePhone(raw: string): string | null` (E.164 or null)
  - `normalizeEmail(raw: string): string | null`
  - `suggestEmailFix(email: string): string | null` (fixes `gmial.com`, `gmail.co`, `hotmial.com`, `yahooo.com`, `outlok.com`)
  - `nameScript(name: string): 'ar' | 'en' | 'mixed'`
  - `normalizeArabicForSearch(s: string): string`, which must match SQL `public.normalize_search` in Task 2

- [ ] **Step 1: Scaffold.**
  - `npm create vite@5 . -- --template react-ts`
  - add the deps from Tech Stack
  - `vercel.json` contains:
    - SPA rewrite `{"source":"/((?!api/).*)","destination":"/index.html"}`
    - headers on `/(.*)`: `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`
    - a CSP allowing self, the Supabase URL, `fonts.googleapis.com` and `fonts.gstatic.com`
  - `.gitignore` covers `.env*` except `.env.example`, plus `output/`, `__pycache__/`, `node_modules/`
- [ ] **Step 2: Write the failing tests.**

```ts
expect(normalizePhone('0770 123 4567')).toBe('+9647701234567');
expect(normalizePhone('٠٧٧٠١٢٣٤٥٦٧')).toBe('+9647701234567');
expect(normalizePhone('009647701234567')).toBe('+9647701234567');
expect(normalizePhone('+98 912 345 6789')).toBe('+989123456789');
expect(normalizePhone('+61 412 345 678')).toBe('+61412345678');
expect(normalizePhone('12345')).toBeNull();
expect(normalizeEmail('  Ali@Gmail.COM ')).toBe('ali@gmail.com');
expect(normalizeEmail('ali@')).toBeNull();
expect(suggestEmailFix('ali@gmial.com')).toBe('ali@gmail.com');
expect(suggestEmailFix('ali@gmail.com')).toBeNull();
expect(nameScript('محمد الباقر')).toBe('ar');
expect(nameScript('Mohammed Albaqir')).toBe('en');
expect(normalizeArabicForSearch('أحْمَد  إبراهيم')).toBe(normalizeArabicForSearch('احمد ابراهيم'));
expect(normalizeArabicForSearch('فاطمة')).toBe(normalizeArabicForSearch('فاطمه'));
expect(normalizeArabicForSearch('مصطفى')).toBe(normalizeArabicForSearch('مصطفي'));
expect(normalizeArabicForSearch('Ali  HASAN')).toBe('ali hasan');
```

- [ ] **Step 3:** run `npx vitest run src/lib/normalize.test.ts`. Expected: FAIL because the module isn't found.
- [ ] **Step 4: Implement in `src/lib/normalize.ts`.**
  - Search normalisation, in order:
    1. lowercase
    2. strip `\u064B-\u0652\u0640`
    3. map `[أإآٱ]→ا`, `ة→ه`, `ى→ي`, `ؤ→و`, `ئ→ي`
    4. collapse whitespace and trim
- [ ] **Step 5:** run the tests. Expected: PASS.
- [ ] **Step 6:** `git init`, add the owner's remote, commit `chore: scaffold app with shared normalisers`.

### Task 2: Core schema, row-level security and role helpers

**Files:**
- Create: `supabase/migrations/20261118000001_core.sql`
- Create: `tests/db/helpers.ts`, `tests/db/core.test.ts`
- Create: `vitest.db.config.ts` (env `STAGING_SUPABASE_URL`, `STAGING_ANON_KEY`, `STAGING_SERVICE_ROLE_KEY`; runs serially)

**Interfaces:**
- **Tables**, all with row-level security on and **no policies**, so nothing can read or write them directly:
  - `events(id uuid pk, slug text unique, name_ar, name_en, starts_on date, ends_on date, registration_open bool default false, cards_enabled bool default false, certificates_enabled bool default false, created_at)`
  - `staff(user_id uuid pk references auth.users on delete cascade, email text unique, role text check in ('owner','admin','doctor'), display_name text, active bool default true, created_at, created_by uuid)`
  - `guests(id uuid pk, event_id fk, serial text unique, full_name, name_script text check in ('ar','en','mixed'), phone text, email text, gender text check in ('male','female'), guest_type text check in ('visitor','student','other'), workplace, specialization, lang text check in ('ar','en'), is_vip bool default false, created_at, unique(event_id, phone), unique(event_id, email))`
  - `guest_checkins(guest_id fk on delete cascade, day date, at timestamptz default now(), primary key(guest_id, day))`
  - `researchers(id uuid pk, event_id fk, name_ar text not null, name_en text, email text not null, phone text, gender text check in ('male','female') null, institution text, research_title text not null, search_key text not null, is_vip bool default false, created_at, unique(event_id, email, research_title))`
  - `researcher_signoffs(id uuid pk, researcher_id uuid unique fk, day date, signature_path text, strokes_path text, sig_sha256 text, doctor_id uuid fk staff, device text, signed_at timestamptz default now())`
  - `templates(id uuid pk, event_id fk, kind text check in ('card','certificate'), forma_path text, width int, height int, layout jsonb, updated_at, updated_by uuid, unique(event_id, kind))`
  - `deliveries(id uuid pk, event_id fk, kind text check in ('card','certificate'), guest_id uuid null fk, researcher_id uuid null fk, to_email text, lang text, status text check in ('queued','waiting_template','disabled','sending','sent','failed'), attempts int default 0, next_attempt_at timestamptz default now(), last_error text, provider_id text, file_path text, created_at, sent_at, check(num_nonnulls(guest_id, researcher_id) = 1), unique(kind, guest_id), unique(kind, researcher_id))`
  - `audit_log(id bigint identity pk, at timestamptz default now(), actor uuid, action text, target text, details jsonb)`
- **Functions:**
  - `public.normalize_search(text) returns text immutable`, with the same mapping as Task 1
  - `public.baghdad_today() returns date`
  - `public.my_role() returns text`: the active staff role or null, with **admin/owner returning null unless `auth.jwt()->>'aal' = 'aal2'`**
  - `public.require_role(variadic roles text[]) returns uuid`: raises `insufficient_privilege` otherwise and returns `auth.uid()`
  - `public.whoami() returns json {role, aal, email}`, granted to `authenticated`. `role` is the staff role **regardless of aal**, so the UI can send an aal1 admin to the authenticator step. All authorisation goes through `my_role()` / `require_role()`, which do apply the aal2 gate.
  - `public.audit(action text, target text, details jsonb)`, internal
- **Seed:** the event row from Global Constraints
- **Test helpers in `tests/db/helpers.ts`:**
  - `anonClient()`
  - `serviceClient()`
  - `userClient(role: 'doctor'|'admin'|'owner', opts?: {aal2?: boolean})`: creates the user with the service client, inserts the staff row, signs in, and for aal2 enrols TOTP and verifies with otplib
  - `resetData()`: truncates everything except `events` and `staff`

- [ ] **Step 1: Write the failing tests.**
  - `anon cannot select any table`: every table returns an empty array or a permission error
  - `whoami for doctor returns role doctor`
  - `whoami for admin at aal1 reports role admin and aal aal1`
  - `my_role for admin at aal1 is null and at aal2 is admin`
  - `normalize_search matches the client normaliser` for the 4 Arabic pairs from Task 1
- [ ] **Step 2:** `npx supabase db push --db-url $STAGING_DB_URL`, then `npx vitest run -c vitest.db.config.ts tests/db/core.test.ts`. Expected: FAIL.
- [ ] **Step 3:** write the migration as specified above.
- [ ] **Step 4:** push it to staging and run the tests. Expected: PASS.
- [ ] **Step 5:** commit `feat(db): core schema with locked-down RLS and role helpers`.

### Task 3: Public functions — registration, check-in, event info, hall counters

**Files:**
- Create: `supabase/migrations/20261118000002_public.sql`
- Test: `tests/db/public.test.ts`

**Interfaces:**
- Consumes: Task 2 tables and `baghdad_today()`.
- Produces (all granted to `anon, authenticated`):
  - `get_public_event(p_slug text) returns json {slug, name_ar, name_en, starts_on, ends_on, registration_open}`
  - `register_guest(p_slug, p_full_name, p_phone, p_email, p_gender, p_guest_type, p_workplace, p_specialization, p_lang) returns json`
    - returns `{status: 'created'|'already_registered'|'closed'|'invalid', serial?: text, field?: text, checked_in_today: bool}`
    - checks again on the server:
      - name between 3 and 120 characters
      - phone matches `^\+[1-9]\d{7,14}$` (the client sends it normalised)
      - email matches `^[^@\s]+@[^@\s]+\.[^@\s]+$` and is at most 254 characters
      - enum fields are valid
      - workplace and specialisation between 2 and 160 characters
    - on `created`:
      - inserts the guest and today's check-in
      - inserts a `card` delivery whose status is `disabled` if `cards_enabled` is false, `waiting_template` if there's no card template, and `queued` otherwise
    - on duplicate phone or email: records today's check-in and returns `already_registered` with the **existing serial**, but no other personal data
  - `checkin_guest(p_slug, p_serial, p_phone) returns json {status:'ok'|'not_found'|'closed', checked_in_today}`: both serial and phone must match
  - `get_display_counts(p_slug) returns json {total, present_today, male, female, vip, researchers_signed, researchers_total}`
    - `male` and `female` include signed-off researchers who have a gender
    - `researchers_signed` counts distinct researcher emails with a sign-off

- [ ] **Step 1: Write the failing tests.**
  - `register_guest creates guest, checkin and queued card when enabled with template`
  - `register_guest queues disabled card when cards_enabled is false`
  - `register_guest returns closed when registration_open is false`
  - `register_guest accepts international numbers (+98, +961, +213, +234, +61)`
  - `register_guest rejects invalid email with field=email`
  - `second registration same phone records checkin only`: the second call with the same phone and a different email returns `already_registered` with the same serial, and the guest and card-delivery counts each stay at 1
  - `second registration same email different phone is already_registered`
  - `checkin_guest needs both serial and phone`
  - `get_display_counts returns aggregates only`: the keys equal exactly the 7 listed above
  - `present_today uses Baghdad date`: insert a check-in for `baghdad_today()` and expect `present_today = 1`
- [ ] **Step 2:** push and run. Expected: FAIL.
- [ ] **Step 3:** implement the functions. Serial generation loops until it's unique, using `gen_random_bytes`.
- [ ] **Step 4:** push and run. Expected: PASS.
- [ ] **Step 5:** commit `feat(db): guest registration, day check-in and hall counters`.

### Task 4: Researcher sign-off functions and private storage

**Files:**
- Create: `supabase/migrations/20261118000003_researchers.sql`
- Test: `tests/db/researchers.test.ts`

**Interfaces:**
- **Storage buckets** (all private):
  - `signatures`
    - doctors and admins may `INSERT` under `signatures/<event_id>/<researcher_id>/`
    - admins and the owner may `SELECT`
    - only the owner may `DELETE`
    - nobody may `UPDATE`
  - `templates`: admins only
  - `outputs`: service role only
- **Functions:**
  - `search_researchers(p_slug, p_query text) returns table(id, name_ar, name_en, institution, research_title, signed bool)`
    - requires doctor, admin or owner
    - the query must be at least 2 characters after normalising
    - matches `search_key ilike '%'||normalize_search(q)||'%'`
    - ordered by signed asc then name, limit 25
  - `sign_off_researcher(p_researcher_id uuid, p_signature_path text, p_strokes_path text, p_sig_sha256 text, p_device text) returns json {status:'signed'|'already_signed'|'certificates_paused', signed_at}`
    - requires doctor, admin or owner
    - the paths must start with `signatures/<event_id>/<p_researcher_id>/`
    - idempotent
    - queues a `certificate` delivery; its status follows the same three-way rule as cards, using `certificates_enabled`
- **Trigger:** `researchers.search_key` is set from `normalize_search(name_ar || ' ' || coalesce(name_en,'') || ' ' || email)` on insert and update.

- [ ] **Step 1: Write the failing tests.**
  - `anon cannot search`
  - `doctor search matches Arabic variants`: `احمد` finds `أحمد`
  - `doctor search matches English name`
  - `doctor search under 2 characters returns error`
  - `sign_off twice returns already_signed and one delivery`
  - `sign_off rejects path for another researcher`
  - `doctor cannot read signatures bucket`
  - `doctor cannot delete signature object`
  - `owner can delete signature object`
- [ ] **Step 2:** push and run. Expected: FAIL.
- [ ] **Step 3:** implement the migration, including the storage policies on `storage.objects` keyed on `bucket_id` and `(storage.foldername(name))`.
- [ ] **Step 4:** push and run. Expected: PASS.
- [ ] **Step 5:** commit `feat(db): researcher search, idempotent sign-off and private signature storage`.

### Task 5: Admin and owner functions, audit log, staff invites

**Files:**
- Create: `supabase/migrations/20261118000004_admin.sql`
- Create: `api/staff.py`, `engine/auth.py`, `engine/supa.py`
- Test: `tests/db/admin.test.ts`, `tests/py/test_auth.py`

**Interfaces:**
- **Admin functions** (require admin or owner at aal2; every write calls `audit()`):
  - `admin_overview(p_slug) returns json`: the counts plus deliveries grouped by kind and status
  - `admin_list_guests(p_slug, p_search text, p_limit int, p_offset int) returns json {rows, total}`
  - `admin_update_guest(p_id, p_patch jsonb) returns json`: only these keys may change: `full_name, phone, email, gender, guest_type, workplace, specialization, is_vip`
  - `admin_delete_guest(p_id) returns void`
  - `admin_import_researchers(p_slug, p_rows jsonb) returns json {inserted, updated, errors:[{row, message}]}`: upserts on `(event_id, email, research_title)` and validates each row
  - `admin_list_researchers(p_slug, p_search, p_limit, p_offset) returns json {rows, total}`: each row includes `signed_at`, `doctor_name`, `signature_path`
  - `admin_set_vip(p_kind text check in ('guest','researcher'), p_id uuid, p_value bool)`
  - `admin_set_switches(p_slug, p_registration_open bool, p_cards_enabled bool, p_certificates_enabled bool) returns json`: calls `release_deliveries` for any kind that was turned on
  - `admin_list_deliveries(p_slug, p_status text, p_limit, p_offset) returns json`
  - `admin_retry_delivery(p_id)`: sets the status back to `queued`
  - `admin_save_template(p_slug, p_kind, p_forma_path, p_width, p_height, p_layout jsonb)`: calls `release_deliveries`
  - `admin_export(p_slug) returns json {guests:[…], researchers:[…], checkins:[…]}`
  - `release_deliveries(p_event_id, p_kind)`: internal, not granted to anyone. It moves `disabled` and `waiting_template` rows to `queued` when that kind's switch is on and its template exists. It's defined here because `admin_set_switches` and `admin_save_template` call it.
- **Owner functions** (require owner at aal2):
  - `owner_list_staff() returns json`
  - `owner_set_staff(p_user_id, p_role, p_active)`: the owner can't demote or deactivate themself
  - `owner_audit(p_limit, p_offset) returns json`
- **One-off setup:** `bootstrap_owner(p_email text) returns text`
  - granted to `postgres` only
  - does nothing if an owner already exists
- **`api/staff.py`** (POST `{email, role:'admin'|'doctor', display_name}`):
  - checks the caller's JWT with `engine.auth.require_role(token, {'owner'})`
  - calls the Supabase admin API `inviteUserByEmail`
  - inserts the staff row with the service role
  - writes an audit entry
- **`engine/auth.py`:**
  - `class AuthError(Exception)`
  - `require_role(token: str, allowed: set[str], http=requests) -> dict`: calls `GET /auth/v1/user` and then the `whoami` RPC with the caller's token, rejects admin/owner unless `aal == 'aal2'`, and raises `AuthError(401|403)`
- **`engine/supa.py`:**
  - `class Supa(url, service_key, http=requests)`
  - methods: `rpc(name, args) -> Any`, `download(bucket, path) -> bytes`, `upload(bucket, path, data, content_type) -> None`

- [ ] **Step 1: Write the failing tests.**
  - `doctor cannot call any admin_ function` (loop over all of them)
  - `admin without aal2 is rejected`
  - `admin cannot call owner_ functions`
  - `admin_update_guest ignores unknown keys`
  - `admin_import_researchers reports bad email row and inserts the rest`
  - `admin_set_switches releases disabled cards`
  - `release moves waiting_template to queued after template saved`
  - `every admin write adds an audit_log row`
  - `owner cannot deactivate self`
  - `bootstrap_owner is not executable by anon or authenticated`
  - Python: `test_require_role_rejects_doctor_for_owner_route` and `test_require_role_rejects_missing_token`, both with a fake `http`
- [ ] **Step 2:** run. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run `npx vitest run -c vitest.db.config.ts tests/db/admin.test.ts` and `pytest tests/py/test_auth.py -v`. Expected: PASS.
- [ ] **Step 5:** commit `feat(db): admin and owner functions with aal2 gate, audit log and staff invites`.

### Task 6: Delivery queue and automatic triggering

**Files:**
- Create: `supabase/migrations/20261118000005_queue.sql`
- Test: `tests/db/queue.test.ts`

**Interfaces** (all granted to `service_role` only):
- `claim_deliveries(p_limit int default 10) returns setof deliveries`
  - picks rows that are `queued` with `next_attempt_at <= now()`, plus rows stuck in `sending` for more than 5 minutes
  - `FOR UPDATE SKIP LOCKED`
  - sets `status='sending'`
- `complete_delivery(p_id, p_provider_id text, p_file_path text)`: sets `status='sent'` and `sent_at`
- `fail_delivery(p_id, p_error text)`: increments attempts and sets `next_attempt_at` using the backoff from Global Constraints; after 5 attempts sets `status='failed'`
- `delivery_context(p_id) returns json`: everything the engine needs to make one item
  - `{kind, lang, to_email, values:{full_name, serial|research_title, institution, event_name}, template:{forma_path, width, height, layout}}`
  - `event_name` is `name_ar` or `name_en`, following `lang`
  - for researchers, `full_name` is `name_ar`, or `name_en` when the person's language is `en` and `name_en` is not empty
- **Automatic triggering:**
  - a trigger `deliveries_kick` runs `AFTER INSERT OR UPDATE OF status` when the new status is `queued`
  - it calls `net.http_post(url := vault 'deliver_url', headers := {'Authorization': 'Bearer ' || vault 'delivery_secret'})`
  - `cron.schedule('deliver-sweep', '* * * * *', …)` makes the same call every minute

- [ ] **Step 1: Write the failing tests.**
  - `concurrent claims never return the same row`: insert 20 queued rows, run two `claim_deliveries(10)` in parallel, and expect the two id sets not to overlap and to total 20
  - `fail_delivery applies backoff 1,2,5,15,60 then failed`
  - `stale sending is reclaimed after 5 minutes`
  - `delivery_context picks name_en for en researcher and falls back to name_ar`
  - `anon and admin cannot call claim_deliveries`
- [ ] **Step 2:** run. Expected: FAIL.
- [ ] **Step 3:** implement. Vault secrets are created by the owner in the dashboard, and the plan's runbook names them `deliver_url` and `delivery_secret`.
- [ ] **Step 4:** run. Expected: PASS.
- [ ] **Step 5:** commit `feat(db): safe delivery queue with backoff and automatic kick`.

---

## Milestone B — Card and certificate engine

### Task 7: Python renderer, ported from alfarabi-cert-engine

**Files:**
- Create: `engine/text.py`, `engine/render.py`, `engine/fonts/` (IBM Plex Sans Arabic Bold, Noto Naskh Arabic Bold, IBM Plex Sans Bold — OFL licence files included)
- Port from: `D:\antigravity\scratch\alfarabi-cert-engine\src\cert_generator.py` (`_shape_arabic`, font fitting)
- Test: `tests/py/test_render.py`

**Interfaces:**
- **`engine/text.py`:**
  - `shape(text: str) -> str`: returns the text unchanged when Pillow has raqm, and otherwise runs `arabic_reshaper` + `bidi`
  - `fit_text(draw, text, font_path, size, min_size, max_width, max_lines) -> tuple[ImageFont, list[str]]`
- **Layout JSON** (same shape as the cert engine's `layout.json`, plus `max_lines`): each field is `{text:"{full_name}", x, y, anchor, font, font_ar, size, min_size, max_width, max_lines, color, line_gap}`, with coordinates in template pixels.
- **`engine/render.py`:**
  - `render(forma: Image.Image, layout: dict, values: dict[str,str]) -> Image.Image`
  - `to_pdf(img) -> bytes` (Pillow PDF, 150 dpi)
  - `to_png(img) -> bytes`
  - `forma_from_upload(data: bytes, content_type: str) -> Image.Image`: the first page of a PDF via pypdfium2 at 150 dpi, longest side capped at 3000 px
- **Values available:** `full_name`, `serial`, `research_title`, `institution`, `event_name`

- [ ] **Step 1: Write the failing tests.**
  - `test_shape_joins_arabic_letters`: the output differs from the input, or raqm is available
  - `test_fit_text_shrinks_before_wrapping`: a 30-character name at size 60 with max_width 400 gives one line and a size below 60
  - `test_fit_text_wraps_long_title_within_box`: a 180-character Arabic research title gives at most `max_lines` lines, each measured width ≤ `max_width`
  - `test_fit_text_ellipsis_when_exceeding_max_lines`
  - `test_render_long_arabic_name_stays_in_bounds`: render the 120-character name `'عبد ' * 30` onto a blank 1600×1100 forma and check the bounding box of non-background pixels lies within the field's box
  - `test_render_mixed_script_name`
  - `test_forma_from_pdf_returns_image`: uses `assets/test_template.pdf` copied from the cert engine
- [ ] **Step 2:** run `pytest tests/py/test_render.py -v`. Expected: FAIL.
- [ ] **Step 3:** implement, reusing the cert engine's shaping and fitting logic and adding wrapping.
- [ ] **Step 4:** run. Expected: PASS.
- [ ] **Step 5:** commit `feat(engine): Arabic-safe renderer with shrink, wrap and PDF formas`.

### Task 8: Mailer, email texts and the job processor

**Files:**
- Create: `engine/mailer.py`, `engine/emails.py`, `engine/jobs.py`
- Test: `tests/py/test_jobs.py`, `tests/py/test_emails.py`

**Interfaces:**
- **`engine/mailer.py`:**
  - `class Mailer(api_key, sender, http=requests)`
  - method `send(to: str, subject: str, html: str, text: str, attachments: list[tuple[str, bytes, str]]) -> str`: calls Resend `POST /emails` and returns the id
  - raises `MailError` on a status other than 2xx
  - sends header `Idempotency-Key: delivery-<id>`, so a retry can't double-send
- **`engine/emails.py`:** `build(kind: str, lang: str, values: dict) -> tuple[subject, html, text]`
  - the `ar` HTML has `dir="rtl"`
  - logos come from absolute URLs on the site
  - `card` subject: ar `بطاقة حضورك — مؤتمر الفارابي`, en `Your attendee card — Al-Farabi Conference`
  - `certificate` subject: ar `شهادة المشاركة — مؤتمر الفارابي`, en `Your participation certificate — Al-Farabi Conference`
  - every value is HTML-escaped
- **`engine/jobs.py`:** `process_batch(supa: Supa, mailer: Mailer, limit=10) -> dict {claimed, sent, failed}`. For each claimed row:
  1. `delivery_context`
  2. download the forma (cached per path for the run)
  3. `render`
  4. card → PNG, certificate → PDF and PNG
  5. upload to `outputs/<event>/<kind>/<id>.<ext>`
  6. `mailer.send`
  7. `complete_delivery`
  - any exception → `fail_delivery(id, str(e)[:500])`, then continue with the next row

- [ ] **Step 1: Write the failing tests** (with fake Supa and Mailer).
  - `test_process_batch_sends_and_completes`
  - `mailer failure calls fail_delivery with backoff`: the fake mailer raises and `fail_delivery` is recorded, and other rows still complete
  - `test_one_bad_row_does_not_stop_batch`
  - `test_idempotency_key_uses_delivery_id`
  - `test_build_escapes_html_in_name`: `<script>` is escaped
  - `test_build_ar_is_rtl`
- [ ] **Step 2:** run. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run. Expected: PASS.
- [ ] **Step 5:** commit `feat(engine): job processor with idempotent Resend mailer and bilingual emails`.

### Task 9: Vercel functions: deliver, preview, template

**Files:**
- Create: `api/deliver.py`, `api/preview.py`, `api/template.py`
- Test: `tests/py/test_api.py`

**Interfaces:**
- **`api/deliver.py`** (POST):
  - checks `Authorization: Bearer <DELIVERY_SECRET>` with `hmac.compare_digest`; returns 401 otherwise
  - runs `process_batch(limit=10)` and returns the summary JSON
- **`api/preview.py`** (POST `{kind, layout, forma_path, sample_values}`):
  - requires admin or owner (`require_role`)
  - returns `image/png`
- **`api/template.py`** (POST `{kind, upload_path, content_type}`):
  - requires admin or owner
  - downloads from `templates/`, runs `forma_from_upload`, and uploads `templates/<event>/<kind>/forma.png`
  - returns `{forma_path, width, height}`

- [ ] **Step 1: Write the failing tests.**
  - `test_deliver_rejects_wrong_secret`
  - `test_deliver_runs_batch_with_right_secret`
  - `test_preview_requires_admin`
  - `test_template_converts_pdf_and_returns_size`
- [ ] **Step 2:** run. Expected: FAIL.
- [ ] **Step 3:** implement. Each file holds a `class handler(BaseHTTPRequestHandler)` that delegates to a testable function, for example `handle_deliver(headers, body, deps) -> (status, headers, body)`.
- [ ] **Step 4:** run. Expected: PASS.
- [ ] **Step 5: Deploy a preview and smoke-test it.**
  - POST `/api/preview` with the admin token and an Arabic sample name
  - open the PNG and check the letters are joined, so we know Arabic shaping works on Vercel's Linux
- [ ] **Step 6:** commit `feat(api): deliver, preview and template functions`.

---

## Milestone C — Screens

Use the `design-taste-frontend` skill for Tasks 10–12 and 15–16.

### Task 10: Design system, translations and brand assets

**Files:**
- Create:
  - `src/styles/tokens.css`
  - `src/styles/base.css`
  - `src/i18n/ar.ts`, `src/i18n/en.ts`, `src/i18n/index.tsx`
  - `src/brand/ConferenceMark.tsx` (the conference mark redrawn as SVG: diamond, arch, swoosh)
  - `public/brand/crest.png`, `public/brand/ministry.png` (originals, or upscaled 2× as the fallback)
  - `src/components/Shell.tsx`
- Test: `src/i18n/i18n.test.ts`

**Interfaces:**
- `detectLang(languages: readonly string[]): 'ar'|'en'`
- `I18nProvider`
- `useI18n(): {lang, setLang, t(key: Key, vars?: Record<string,string>): string, dir: 'rtl'|'ltr'}`
- `Key` is the union of the `ar` keys, and `en` must have the same keys, which the type system enforces.
- `Shell({children, variant:'public'|'staff'})` provides:
  - the header with the logos and the language toggle
  - the navy dotted background (CSS radial-gradient pattern)
  - the footer

- [ ] **Step 1: Write the failing tests.**
  - `detectLang(['ar-IQ','en'])` → `ar`
  - `detectLang(['en-US','ar'])` → `en`
  - `detectLang([])` → `ar`
  - `t interpolates {name}`
  - `setLang updates html dir and lang attributes`
- [ ] **Step 2:** run. Expected: FAIL.
- [ ] **Step 3:** implement the tokens from Global Constraints. Sizing:
  - fluid type scale
  - 16px side gutter
  - minimum tap target 48px
  - visible focus rings in gold
- [ ] **Step 4:** run. Expected: PASS.
- [ ] **Step 5:** commit `feat(ui): design tokens, bilingual i18n and brand shell`.

### Task 11: Guest registration page and thank-you robot

**Files:**
- Create:
  - `src/pages/Register.tsx`
  - `src/components/ThanksRobot.tsx`
  - `src/lib/api.ts`
  - `src/lib/pass.ts`
- Test: `src/pages/Register.test.tsx`, `e2e/register.spec.ts`

**Interfaces:**
- **`api.ts`:**
  - `getPublicEvent(slug)`
  - `registerGuest(input: GuestInput): Promise<RegisterResult>`: retries 3 times with backoff on network errors or a 5xx response, and never on a 4xx
  - `checkinGuest(serial, phone)`
  - `getDisplayCounts(slug)`
- **`pass.ts`** saves to localStorage inside try/catch:
  - `savePass(p: {serial, firstName, phone, lang})`
  - `loadPass(): Pass | null`
  - `clearPass()`
- **`ThanksRobot({firstName, lang})`:**
  - inline SVG under 20 KB: silver humanoid, dark visor, crest on the chest
  - CSS animation: a 2-second wave, a blink every 4 seconds, and a speech bubble typing `t('thanks.robot', {name})`
  - under `prefers-reduced-motion`, a static pose with the full text
- **Form behaviour:**
  - required fields: name, phone, email, gender, workplace, specialisation, type
  - errors appear when a field loses focus
  - an email typo hint offers "Did you mean …?"
  - honeypot field `website`: when it's filled, the page shows the robot without calling the API
  - the submit button is locked while the request is running
  - a `closed` result shows the "registration closed" panel

- [ ] **Step 1: Write the failing tests.**
  - Vitest:
    - `shows field errors on blur`
    - `submit button stays locked while request is in flight`: two clicks mean one API call
    - `already_registered shows robot and saved pass with day check-in`
    - `closed shows closed panel`
    - `email typo suggestion appears for gmial.com`
  - Playwright on a staging preview at a 375×812 viewport:
    - `full registration in Arabic then English`
    - `reload shows saved pass and "record today" button`
- [ ] **Step 2:** run. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run `npx vitest run src/pages` and `npx playwright test e2e/register.spec.ts`. Expected: PASS.
- [ ] **Step 5:** commit `feat(ui): registration with thank-you robot and day-2 check-in`.

### Task 12: Hall screen

**Files:**
- Create: `src/pages/Display.tsx`
- Test: `src/pages/Display.test.tsx`

**Interfaces:**
- **Route:** `/display`, public
- **Data:** polls `getDisplayCounts` every 5 seconds. After a failure it keeps the last numbers and shows a small "reconnecting" dot.
- **Layout:**
  - the QR code (generated by `qrcode` for `${origin}/`) takes up a large part of the screen
  - beside it, six counters: male, female, VIP, researchers, registered, present today
  - numbers animate up when they change
  - built for 1920×1080, with no scrolling

- [ ] **Step 1: Write the failing tests.**
  - `renders the six counters from API`
  - `keeps last values on failed poll`
  - `QR encodes site origin`
- [ ] **Step 2:** run. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run. Expected: PASS.
- [ ] **Step 5:** commit `feat(ui): live hall screen`.

### Task 13: Staff sign-in, authenticator step, idle logout

**Files:**
- Create:
  - `src/auth/AuthProvider.tsx`
  - `src/auth/RequireRole.tsx`
  - `src/auth/useIdleLogout.ts`
  - `src/pages/Login.tsx`
  - `src/pages/MfaSetup.tsx`
- Test: `src/auth/useIdleLogout.test.ts`, `src/auth/RequireRole.test.tsx`

**Interfaces:**
- `useAuth(): {session, role: 'owner'|'admin'|'doctor'|null, aal, signIn(email, pw), signOut()}`. The role comes from the `whoami()` RPC.
- **`RequireRole({roles, children})`:**
  - if the user isn't signed in, it goes to `/staff/login`
  - an admin or owner at aal1 goes to `/staff/mfa`, which enrols TOTP with a QR code the first time and asks for the code after that
  - the wrong role sees a "no access" message
- `useIdleLogout(minutes: number)`: watches pointer, key and touch activity, signs out when the time runs out, and also checks when the page becomes visible again.
- **Routes:**
  - `/staff/login`
  - `/staff/mfa`
  - `/researchers` (doctor, admin, owner)
  - `/admin/*` (admin, owner)

- [ ] **Step 1: Write the failing tests.**
  - `signs out after 15 idle minutes` (fake timers)
  - `activity resets timer`
  - `signs out on visibility change after expiry`
  - `RequireRole sends aal1 admin to mfa`
  - `RequireRole blocks doctor from admin`
- [ ] **Step 2:** run. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run. Expected: PASS.
- [ ] **Step 5:** commit `feat(auth): staff login, TOTP enforcement and idle logout`.

### Task 14: Researcher sign-off page for tablets

**Files:**
- Create:
  - `src/pages/Researchers.tsx`
  - `src/components/SignaturePad.tsx`
  - `src/lib/signoff.ts`
- Test: `src/lib/signoff.test.ts`, `src/pages/Researchers.test.tsx`

**Interfaces:**
- **`signoff.ts`:** `submitSignoff(deps, {eventId, researcherId, png: Blob, strokes: unknown, device: string}): Promise<SignoffResult>`
  1. compute SHA-256 of the PNG
  2. upload the PNG and the strokes JSON to `signatures/<eventId>/<researcherId>/<timestamp>.{png,json}`, retrying up to 4 times with backoff (an object that already exists counts as success)
  3. call `sign_off_researcher` exactly once
- **`SignaturePad({onChange})`:**
  - wraps `signature_pad`
  - handles device pixel ratio
  - has a clear button
  - confirm is disabled until there are at least 2 strokes
- **Page flow:**
  1. the search box, built for landscape tablets, shows results as you type (250 ms debounce, at least 2 characters)
  2. picking a result opens the details: name in both languages, institution, research title
  3. the signature pad
  4. a "Confirm" button
  5. a success screen that returns to search after 4 seconds
  - rows that are already signed show a "signed" badge and can't be signed again

- [ ] **Step 1: Write the failing tests.**
  - `retries upload then calls RPC once`: the fake storage fails twice and then succeeds, and the RPC is called once
  - `upload failing 4 times surfaces error and does not call RPC`
  - `sha256 matches uploaded bytes`
  - `already signed row cannot open pad`
  - `confirm disabled until two strokes`
- [ ] **Step 2:** run. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run. Expected: PASS.
- [ ] **Step 5:** commit `feat(ui): tablet researcher search and handwritten sign-off`.

### Task 15: Admin dashboard part 1: overview, guests, researchers, deliveries, switches

**Files:**
- Create:
  - `src/admin/AdminLayout.tsx`
  - `src/admin/Overview.tsx`
  - `src/admin/Guests.tsx`
  - `src/admin/Researchers.tsx`
  - `src/admin/Deliveries.tsx`
  - `src/admin/Switches.tsx`
  - `src/admin/importResearchers.ts`
- Test: `src/admin/importResearchers.test.ts`, `src/admin/Switches.test.tsx`

**Interfaces:**
- **`parseResearcherSheet(file: ArrayBuffer): {rows: ResearcherRow[], errors: {row:number, message:string}[]}`**
  - headers are matched without regard to case or spacing, and Arabic aliases are accepted: `الاسم`, `الاسم بالانكليزي`, `البريد`, `الهاتف`, `الجنس`, `الجهة`, `عنوان البحث`
  - phone and email are normalised with Task 1's functions
- **Import flow:** preview the parsed rows and errors first, then send them to `admin_import_researchers` in chunks of 200.
- **Researchers table:**
  - a signed badge
  - "View signature" opens a 60-second signed URL
  - a VIP toggle
  - "Resend certificate" calls `admin_retry_delivery`
- **Deliveries:** filter by status, retry a job, and see counts per status.
- **Switches:**
  - three large on/off switches
  - turning one off asks for confirmation
  - shows when each was last changed and by whom (from the audit log)
- **Lazy loading:** `/admin` is loaded with `React.lazy` so the public page stays small. Target: the registration page is under 150 KB gzipped.

- [ ] **Step 1: Write the failing tests.**
  - `parses Arabic headers`
  - `reports row with bad email and keeps others`
  - `accepts empty name_en`
  - `switch off asks for confirmation then calls admin_set_switches`
- [ ] **Step 2:** run. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run. Expected: PASS.
- [ ] **Step 5:** commit `feat(admin): overview, guests, researcher import, deliveries and switches`.

### Task 16: Admin dashboard part 2: template studio, export, staff, audit

**Files:**
- Create:
  - `src/admin/TemplateStudio.tsx`
  - `src/admin/Export.tsx`
  - `src/admin/exportSheet.ts`
  - `src/admin/Staff.tsx`
  - `src/admin/Audit.tsx`
- Test: `src/admin/exportSheet.test.ts`

**Interfaces:**
- **Template studio** (ported from the cert engine's click-to-place studio):
  - upload a PNG, JPG or PDF to `templates/` → `/api/template` → shows the forma
  - click to place each field; size, minimum size, max width, max lines and colour are editable
  - "Preview" calls `/api/preview` with a long sample Arabic name and title
  - "Save" calls `admin_save_template`
- **`buildExport(data: AdminExport, lang: 'ar'|'en'): Workbook`**
  - sheets: Guests, Researchers, Check-ins
  - headers and fixed values (gender, type, yes/no) in `lang`
  - researcher name = `lang==='en' ? (name_en || name_ar) : name_ar`
  - guest names stay exactly as stored
  - the file is named `alfarabi-conf-2026-<lang>-<YYYYMMDD-HHmm>.xlsx`
- **Staff page** (owner only): a list, an invite form (POST `/api/staff`), and an activate/deactivate toggle.
- **Audit page** (owner only): a paged list.

- [ ] **Step 1: Write the failing tests.**
  - `export en uses name_en with fallback to name_ar`
  - `export ar translates gender and type values`
  - `export keeps guest names as typed`
  - `export header row fully in chosen language`
- [ ] **Step 2:** run. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run. Expected: PASS.
- [ ] **Step 5:** commit `feat(admin): template studio, single-language export, staff and audit`.

---

## Milestone D — Rehearsal and freeze (20 Nov)

### Task 17: Load test, full rehearsal, production deploy, runbook

**Files:**
- Create: `tests/load/register_burst.mjs` (adapted from the old `test/load_test_500.js`), `scripts/check_grants.sql`, `docs/RUNBOOK.md`

- [ ] **Step 1: Grants check.** `scripts/check_grants.sql` lists every function executable by `anon`. Run it on staging. Expected output exactly: `get_public_event, register_guest, checkin_guest, get_display_counts`.
- [ ] **Step 2: Load test.** Run `node tests/load/register_burst.mjs --n 500 --concurrency 100` against staging. Expected:
  - 0 errors
  - p95 under 1.5 s
  - 500 guests and 500 card jobs
  - the queue drains within 10 minutes with cards switched on, using a staging Resend test address
- [ ] **Step 3: Full rehearsal on real devices** (2 phones, 1 tablet, the projector):
  - register in Arabic and English
  - day-2 check-in
  - a doctor signs off 3 researchers, including the network being turned off mid-upload
  - the certificate arrives
  - the switches pause and resume sending
  - export in both languages
  - an admin idle logout at 15 minutes
- [ ] **Step 4: Production deploy.**
  - push migrations to prod
  - run `bootstrap_owner`
  - the owner invites the doctors
  - import the researchers
  - upload the designs
  - leave all switches off until the morning of 21 Nov
- [ ] **Step 5: `docs/RUNBOOK.md`.** It covers:
  - what to do on event morning (open registration, switch cards on)
  - what to check on the dashboard
  - what to do if emails fail (check the Resend status, retry from Deliveries)
  - how to pause everything
  - who has access
- [ ] **Step 6:** commit `chore: load test, grants check and event runbook`, then tag `v1.0-event`.
