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

## Where it runs: on the laptop, as a batch (decided)

| | Laptop batch (Playwright, already installed) | Vercel Node function + `@sparticuz/chromium` |
|---|---|---|
| Works today | Yes, with the same Chromium the tests use | New deploy, not yet tested on Vercel |
| Limits | None | About 60 MB of Chromium per cold start, a memory and time limit per call, and the forma and fonts must be bundled |
| Failure on the day | Visible on the laptop, rerun the batch | A silent timeout or out-of-memory error inside the queue |
| Cost | The laptop must be on when certificates go out | Runs unattended |

The laptop batch is the safer choice for 21–22 Nov. Certificates go out after the sessions in any case, not at registration time. The batch will:

1. call `issue_certificate()` for each person (an idempotent serial);
2. render and check the certificate;
3. upload the PDF to the `outputs` bucket;
4. queue the email.

The existing Vercel sender then emails the stored file instead of drawing it. Emails, retries and the Resend key all stay on Vercel. The laptop needs `SUPABASE_SERVICE_ROLE_KEY` in a local, git-ignored `.env`, provided by the owner.

**Not wired yet.** Sending waits until the owner approves the samples.
