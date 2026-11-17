# Morning test with the doctors — step by step

Live site: **https://al-farabi-gilt.vercel.app**
Supabase project: **mb69i's Project** (`kxwimaslalczappzngci`)

Total time for you before the doctors arrive: about **10 minutes**.

---

## 1. Three Supabase settings (2 minutes)

Supabase dashboard → your project → **Authentication**:

1. **Sign In / Providers** → turn **OFF** "Allow new users to sign up".
2. **Multi-Factor** (or Sign In / Providers → MFA) → make sure **TOTP** is **enabled**.
3. **URL Configuration** → **Site URL** = `https://al-farabi-gilt.vercel.app`

## 2. Your owner account (2 minutes)

1. **Authentication → Users → Add user → Create new user**
   - Email: `malbaqr431@gmail.com`
   - Password: your own, at least 12 characters (keep it in your password manager)
   - Tick **Auto Confirm User** → **Create user**
2. **SQL Editor** → run this once:

   ```sql
   select public.bootstrap_owner('malbaqr431@gmail.com');
   ```

   It must answer `ok`. (It only ever works once; afterwards it answers "owner already exists".)

## 3. Accounts for the doctors (1 minute each)

For each doctor: **Authentication → Users → Add user → Create new user**
- their email, a temporary password you choose, tick **Auto Confirm User**.

Write the passwords down to hand to the doctors on paper. Do not send them by chat.

## 4. Sign in as owner and give the doctors their role (3 minutes)

1. Open **https://al-farabi-gilt.vercel.app/staff/login**, sign in with your email + password.
2. The site shows a **QR code** the first time. Scan it with **Google Authenticator** or
   **Microsoft Authenticator**, type the 6-digit code → you land on the admin dashboard.
3. **الكادر / Staff** → "Give a role to an existing account" → each doctor's email, name,
   role **Doctor** → **Give role**.

## 5. The test with the doctors

On each tablet:
1. Open **https://al-farabi-gilt.vercel.app/staff/login** and sign in with the doctor's account.
   They go straight to **توقيع الباحثين** (researcher sign-off).
2. Type part of a name, e.g. `احمد`, `فاطمه`, `مصطفى` or `john`.
   Five **demo researchers** marked **(تجريبي)** / **(Demo)** are already loaded.
3. Tap a name → check the details → the researcher signs with a finger → **تأكيد التوقيع**.
4. Expected message right now: **"تم حفظ التوقيع. إرسال الشهادات متوقف مؤقتاً…"**
   (certificates are paused until email is set up — this is correct).
5. Search the same name again: it shows **تم التوقيع** and cannot be signed twice.

What to try on purpose:
- Arabic letter variants: `احمد` finds `أحمد`, `فاطمه` finds `فاطمة`.
- Turn the tablet's Wi-Fi off, tap confirm: after a few seconds of retrying it shows
  **"تعذّر حفظ التوقيع…"** and keeps the signature on screen. Turn Wi-Fi on, tap confirm again:
  it saves once (never twice).
- Leave a doctor's tablet idle for 30 minutes: it signs out by itself.

In the admin dashboard (your laptop) you can watch it live:
- **الباحثون / Researchers** → signed time + **عرض التوقيع** (view signature).
- **نظرة عامة / Overview** → counters.

## 6. Optional: guest registration test

1. Registration is already **open** for the demo (Admin → **التحكم / Controls** to change it).
2. On a phone open **https://al-farabi-gilt.vercel.app** → register → the robot thanks you.
3. Open **https://al-farabi-gilt.vercel.app/display** on a big screen → counters go up.
4. Switch **Registration open** OFF again after the test.

## 7. Not working yet (needs your accounts, not code)

| Feature | Needs |
|---|---|
| Emailing cards and certificates | Resend account + verified domain, then the Vercel secret settings below |
| Uploading designs in the template studio, previews | Vercel server settings below |
| Staff invitation **emails** | Resend SMTP in Supabase (use step 3 + 4 until then) |

Already done (17 Nov): the database keeps the sender's address and its secret in the vault,
the server reuses the site's own Supabase address, and nothing is sent (or used up) until the
email settings exist. You only add these in Vercel → project **al-farabi** → **Settings →
Environment Variables** (you type them, never in chat):

| Name | Value | When |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → **secret** key | now |
| `RESEND_API_KEY` | Resend → API Keys (after the domain shows *Verified*) | after buying the domain |
| `MAIL_FROM` | optional — defaults to `مؤتمر الفارابي <certificates@mb-ai.org>` | only to change the sender |

After adding them: Vercel → **Deployments** → latest → **Redeploy**.

## 8. After the test: remove the demo researchers

SQL Editor:

```sql
delete from public.researchers where email like 'demo.%@example.org';
```

This also removes their test signatures records and certificate jobs. The signature image files
stay in Storage → `signatures`; delete them there if you like (owner only).
