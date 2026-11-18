# Backups (2 laptops) and recovery

Every backup laptop pulls a **read-only** copy of all registrations every 5 minutes.
Each laptop has its own token (only its fingerprint is stored in the database), so one laptop
can be cut off without touching the other.

## What each laptop keeps

Folder `D:\alfarabi-backups` (change with `--dir` at setup):

| File | What it is |
|---|---|
| `latest-guests.csv` | all guests — **double-click to open in Excel** (Arabic shows correctly) |
| `latest-researchers.csv` | the researchers list |
| `latest-checkins.csv` | who was present on which day |
| `latest.json` | the complete copy (guests, researchers, check-ins, signatures info, email status) |
| `backup-YYYYmmdd-HHMMSS.json` | the last 288 copies (one day at one every 5 minutes) |
| `status.txt` | time of the last good backup and the counts — check this first |

A failed run never overwrites the last good copy.

## Setup from the dashboard (any laptop or PC) — recommended

Owner only, signed in with the authenticator: **Admin → Backup devices (أجهزة النسخ الاحتياطي)**.

1. Type a name for the PC (e.g. "Reception PC") → **Add device**. A one-time code appears (valid 30 minutes).
2. On that PC: install Python 3.12+ from python.org (tick "Add to PATH"), then `pip install requests`.
3. Download **backup.py** from the link on the same screen (it is `/backup/backup.py` on the site).
4. In Command Prompt, in the folder with the file: `python backup.py pair ABCD-EFGH` (the code shown).
   It pairs the PC, takes the first backup and schedules one every 5 minutes ("AlFarabi Backup" task).
   Backups go to `D:\alfarabi-backups`, or `Documents\alfarabi-backups` when the PC has no D: drive.

On the same screen: switch a device **off/on** (a switched-off PC skips quietly and keeps its last copy),
see its **last backup** time (flagged "late" after 15 minutes), give a waiting device a **new code**, or
**delete** it (its access stops at once; files already on it stay). Every change is in the audit log.
The PC never shows or sends its secret: it sends only a fingerprint (SHA-256) when pairing.

## Setup the old way (SQL line)

**Laptop 1 (this PC): already done** — token label `laptop-1`, folder `D:\alfarabi-backups`.
Only the scheduling step below is left. It appears in the dashboard list too.

**Laptop 2:**
1. Install Python 3.12+ from python.org (tick "Add to PATH").
2. Copy `scripts\backup.py` from this repo to the laptop, e.g. `C:\alfarabi\backup.py`.
3. Open Command Prompt:
   ```
   pip install requests
   python C:\alfarabi\backup.py init --label laptop-2
   ```
4. It prints **one SQL line** (it contains only a fingerprint, not the token). Run it in
   Supabase → **SQL Editor**, or send that line to the developer.
5. Test once: `python C:\alfarabi\backup.py run` → it prints `ok -> ... (N guests, N researchers)`.

**Schedule it (both laptops)** — Command Prompt, one line (adjust the two paths):
```
schtasks /Create /SC MINUTE /MO 5 /TN "AlFarabi Backup" /TR "\"C:\Path\to\python.exe\" \"C:\alfarabi\backup.py\" run" /F
```
On this PC the paths are
`D:\antigravity\alfarabi-conference\.venv\Scripts\python.exe` and
`D:\antigravity\alfarabi-conference\scripts\backup.py`.
Stop it later with: `schtasks /Delete /TN "AlFarabi Backup" /F`

Keep the laptops plugged in, awake (Power settings → Sleep: Never) and on Wi-Fi during the event.

**Cut off a laptop** (lost or stolen): Supabase → SQL Editor
```sql
update public.backup_tokens set revoked_at = now() where label = 'laptop-2';
```
Every backup is also written to Admin → Audit log (`backup_export`, with the laptop label).

## Recovery — if something goes down

### A. The website is down (Vercel), database fine
1. Check https://www.vercel-status.com and the project's Deployments page.
2. If a new deployment broke it: Vercel → Deployments → the last working one → **Promote** (instant rollback).
3. Meanwhile: registrations on paper or a spare Google Form; open `latest-guests.csv` on a laptop
   for look-ups ("am I registered?").
4. When the site is back, type the paper registrations in through the normal form.

### B. The database is down (Supabase), site loads but registering fails
1. Check https://status.supabase.com. Paused project? Supabase → project → **Restore**.
2. Same fallback as A.3: paper / spare form + the laptops' `latest-*.csv`.
3. Nothing is lost that the laptops already copied (at most 5 minutes old).

### C. Data deleted or the project is lost — restore from a laptop
1. Pick the newest good copy: `latest.json`, or a `backup-…json` from before the problem.
2. New Supabase project (if needed) → SQL Editor → run every file in
   `supabase/migrations/` **in name order**.
3. On a laptop with this repo:
   ```
   python scripts\restore_sql.py D:\alfarabi-backups\latest.json > restore.sql
   ```
4. Open `restore.sql`, paste everything into the SQL Editor, **Run**. Existing rows are kept, so
   running it twice is safe. (Tested: emptying the tables and restoring the real backup gave
   identical counts.)
5. Recreate staff accounts (Authentication → Users) and run `bootstrap_owner` again
   (docs/MORNING-TEST.md). Signature images live in Storage and are not in the JSON; the
   signature records (who, when, fingerprint) are.
6. If it is a new project: update the Supabase URL/keys in Vercel and redeploy (ask the developer).

### D. Sharing a backup
The CSV/JSON files contain names, phones and emails. Keep them on the two laptops only; never
post them in groups. Delete the folder after the event results are final.
