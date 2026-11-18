# Certificate engine (item 9)

The certificates are drawn on **the owner's forma** (`forma/forma.pdf`, sent 17 Nov). It is one image, 3509 × 2481 px at 300 dpi. Chromium prints the person's details onto it and saves:

- a 300 dpi PNG and JPEG, A4 landscape, 3508 × 2480 px;
- a flat PDF of about 1.4 MB holding that one JPEG, with no live text.

| File | What it does |
|---|---|
| `forma/forma.pdf` | The designer's forma, unchanged. |
| `forma/clean.py` | Makes `forma/background.jpg`. It erases the forma's sample text: name, `(اسم الجهة / الجامعة)`, the paragraph with `(اليوم – اليوم الشهر)`, and the sample QR with `ALF-2026-3F9A1C`. The gaps are filled from the surrounding paper. Logos, banner, title, gold rule and signature stay untouched. Rerun it if the forma changes: `.venv/Scripts/python.exe -I certs/forma/clean.py`. |
| `template.html` | Places the text where the forma had it, within about 1% of the sample text's position and size (checked by overlaying both). Fonts: Amiri and IBM Plex Sans Arabic (`engine/fonts`). Colours are sampled from the forma. Placeholders: `{{NAME}}`, `{{ORG_LINE}}`, `{{DATE_PHRASE}}`, `{{SERIAL}}`, `{{QR}}`, `{{VARIANT}}` (`plain` or `sponsors`), `{{SPONSORS}}`. |
| `values.ts` | Checks the input. A missing name, date, verify URL or serial throws before anything is drawn. Dates use Iraqi month names: "بتاريخ 21 تشرين الثاني 2026" or "للفترة من 21 – 22 تشرين الثاني 2026". The organisation goes in brackets, and is left out when empty. |
| `render.ts` | The page loads only local files; all other requests are blocked. Long names shrink first, then wrap onto two lines above the gold rule. The engine fails if a font or the forma is missing, or the text does not fit. The QR points to `<VERIFY_BASE_URL>/verify?s=<serial>`. It is **decoded back out of the finished PNG and out of the JPEG inside the PDF**, and the engine fails if either does not match. |
| `samples.ts` | Renders sample certificates into `certs/samples/` (git-ignored). |

```bash
PLAYWRIGHT_BROWSERS_PATH='D:\antigravity\.pw-browsers' node certs/samples.ts
PLAYWRIGHT_BROWSERS_PATH='D:\antigravity\.pw-browsers' npx vitest run certs
```

## Wording

The engine uses the forma's own wording, the same for everyone. Only the date part changes:

> نثمّن حضوركم فعاليات **مؤتمر الفارابي الأول للبحوث التطبيقية في التحول الرقمي الشامل**
> المقام في رحاب **جامعة الفارابي**، بغداد، العراق {للفترة من 21 – 22 تشرين الثاني 2026 | بتاريخ 21 تشرين الثاني 2026}،
> آملين لكم دوام التقدم العلمي والعطاء خدمةً لعراقنا الحبيب ودعماً لمسيرة العلم والمعرفة.

The signature (أ.د. مازن سمير علي الحكيم) is part of the forma.

Serial numbers keep our database format, `ALF26-XXXX-XXXX-XXXX`, which has 60 random bits. The forma's sample number (`ALF-2026-3F9A1C`) is too short to be safe against guessing.

The sponsors variant puts a "برعاية" row with four logo slots in the empty space between the QR and the signature. The forma itself has no sponsor area.

## Where it runs: on the server, right after registration (owner, 18 Nov)

The owner wants each certificate emailed **straight after registration**. A laptop batch can't do that unless the laptop is always on, so drawing moved to the server.

1. **Registration** (`register_guest`) adds a guest. The `guests_queue_certificate` trigger (migration 18) queues one certificate job. A second-day check-in creates no new guest, so no duplicate is queued.
   - The doctor's sign-off queues researcher certificates, as before.
   - The event's "certificates" switch (Admin → التحكم) still decides whether jobs are `queued` or `disabled`.
2. **The sender** (`api/deliver.py`, woken by the queue) claims the job. It calls **`/api/certificate`** (`api/certificate.mjs`, Node and a serverless Chromium, `@sparticuz/chromium` 130 with `playwright-core` 1.48) with the job id and an HMAC token derived from the service key; the key itself never travels.
3. **`/api/certificate`** then:
   - calls `certificate_job()`, which issues the serial once with the event's dates (it is idempotent);
   - draws the certificate on the forma and checks the QR twice;
   - stores `outputs/<event>/certificate/<delivery>.pdf` and returns that path.
4. **The sender** emails that PDF and marks the delivery as sent.
   - Failures retry after 1, 2, 5, 15 and 60 minutes.
   - The sender takes one job per claim, with a 30-second budget per run, so it always finishes within the 60-second function limit.

Speed: a certificate takes about 3–8 s (longer on a cold start). Bursts drain at roughly 6–10 per minute; the every-minute sweep and each new registration keep the queue moving.

Fallback if the server Chromium ever fails: `certs/render-one.ts` draws on the laptop, and `deliveries.prerendered_path` (migration 17) makes the sender email that file as is.
