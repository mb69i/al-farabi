# Certificate engine (item 9)

Our own template (no `engine-template` folder exists). Chromium draws `template.html`, and the engine saves:

- a 300 dpi PNG, A4 landscape, 3508 × 2480 px;
- a flat PDF holding that one image, with no live text.

| File | What it does |
|---|---|
| `template.html` | The design. Placeholders: `{{NAME}}`, `{{ORG_LINE}}`, `{{DATE_PHRASE}}`, `{{SERIAL}}`, `{{QR}}`, `{{VARIANT}}` (`plain` or `sponsors`), `{{STATEMENT}}`, `{{SPONSORS}}`. Fonts: Amiri and IBM Plex Sans Arabic from `engine/fonts`. Logos come from `public/brand`. |
| `values.ts` | Checks the input and builds the text. A missing name, date, verify URL or serial throws before anything is drawn. Dates use Iraqi month names: "بتاريخ 2 تشرين الثاني 2026" or "للفترة من 22 – 23 أيلول 2026". The organisation goes in brackets, and is left out when empty. |
| `render.ts` | Renders the certificate. The page loads only local files (all other requests are blocked). Long names shrink first, then wrap onto two lines. The engine fails if a font or logo is missing or the text overflows. The QR points to `<VERIFY_BASE_URL>/verify?s=<serial>`; it is **decoded back out of the finished PNG**, and the engine fails if it does not match. |
| `samples.ts` | Renders sample certificates into `certs/samples/` (git-ignored). |

```bash
PLAYWRIGHT_BROWSERS_PATH='D:\antigravity\.pw-browsers' node certs/samples.ts
PLAYWRIGHT_BROWSERS_PATH='D:\antigravity\.pw-browsers' npx vitest run certs
```

## Where it runs: on the laptop, as a batch (decided)

| | Laptop batch (Playwright, already installed) | Vercel Node function + `@sparticuz/chromium` |
|---|---|---|
| Works today | Yes, with the same Chromium the tests use | New deploy, not yet tested on Vercel |
| Limits | None | About 60 MB of Chromium per cold start, a memory and time limit per call, and Arabic fonts must be bundled |
| Failure on the day | Visible on the laptop, rerun the batch | A silent timeout or out-of-memory error inside the queue |
| Cost | The laptop must be on when certificates go out | Runs unattended |

The laptop batch is the safer choice for 21–22 Nov. Certificates go out after the sessions in any case, not at registration time. The batch will:

1. call `issue_certificate()` for each person (an idempotent serial);
2. render and check the certificate;
3. upload the PDF and PNG to the `outputs` bucket;
4. queue the email.

The existing Vercel sender then emails the stored file instead of drawing it. Emails, retries and the Resend key all stay on Vercel. The laptop needs `SUPABASE_SERVICE_ROLE_KEY` in a local, git-ignored `.env`, provided by the owner.

**Not wired yet.** Sending waits until the owner approves the samples and the wording below.

## Draft wording (for the owner to approve)

- Title: **شهادة مشاركة** · CERTIFICATE OF PARTICIPATION
- Lead: تتشرّف جامعة الفارابي بمنح هذه الشهادة إلى
- Name, then the organisation in brackets
- Attendee: تقديراً للمشاركة الفاعلة في أعمال «مؤتمر الفارابي للبحوث التطبيقية في التحول الرقمي الشامل» بنسخته الأولى، المنعقد في جامعة الفارابي – بغداد {date}، متمنّين لكم دوام التوفيق والنجاح.
- Researcher: the same, with "للمشاركة ببحث علمي" in place of "للمشاركة الفاعلة".
- Signatures: رئيس الجامعة · رئيس اللجنة التحضيرية. These are lines only, with no names or signature images yet.
- Sponsors variant: a "برعاية" band with four empty logo slots until real logos are given.

The wording has no gendered verbs, so one sentence fits every person.
