# Al-Farabi Conference System — Design Spec

**Event:** مؤتمر الفارابي للبحوث التطبيقية في التحول الرقمي الشامل — النسخة الأولى
**Dates:** 21–22 November 2026, Al-Farabi University, Baghdad
**Scale:** 21 sessions, 121 papers, 67 institutions (Iraq, Iran, Lebanon, Algeria, Nigeria, Australia, Kurdistan Region), many VIPs.
**Hard deadline:** live and rehearsed by 20 November 2026.

This replaces two existing projects with one system:
- `D:\antigravity\M.P.AI\event-register` (registration tool, deployed from Al-Harith's GitHub)
- `D:\antigravity\scratch\alfarabi-cert-engine` (Python certificate maker + WhatsApp bridge)

## 1. Who uses it

| Person | Where | What they do |
|---|---|---|
| Guest | Own phone, by scanning the hall QR | Registers, sees the thank-you robot, gets an attendee **card** by email |
| Researcher | Doctor's tablet | Signs by hand; gets a **certificate** by email right after |
| Doctor (staff) | Tablet, signed in | Searches a researcher by name, confirms, collects the signature |
| Admin | Laptop, signed in with password and authenticator code | Dashboard, imports, templates, toggles, exports |
| Owner (`malbaqr431@gmail.com`) | Same as admin | Everything an admin does, plus adding and removing staff and reading the audit log |
| Hall screen | Projector | QR code and live counters |

## 2. Decisions (agreed with the owner)

1. **One system.** One repo on the owner's GitHub, one Vercel project, one new Supabase project (plus a free staging project for tests). The site and the certificate/card engine live together. No PC component and no WhatsApp.
2. **Public form fields:** full name (Arabic or English accepted), phone, email, gender (male/female), workplace, specialisation, guest type (visitor / student / other). There is **no "researcher" option** on the public form.
3. **Phones:** Iraqi local numbers (07…) are converted to +9647…. International numbers in `+` format, 8–15 digits, are accepted because foreign participants are expected. Arabic-Indic digits are converted.
4. **Duplicates:** one registration per phone and per email per event. If someone registers again, their attendance for today is recorded and no second card is sent.
5. **Two days:** the event spans 21–22 Nov. Attendance is recorded per day, in Baghdad time. A guest returning on day 2 taps "record today's attendance" on their saved pass, or fills the form again, which records the check-in.
6. **Language:** the UI starts in the phone's language (`navigator.languages[0]` starting with `ar` gives Arabic, anything else English). A toggle is always visible. The guest's language is saved and used for their email.
7. **Thank-you screen:** a lightweight animated SVG robot based on the university's humanoid robot (silver body, dark visor, Al-Farabi crest on the chest). It waves and thanks the guest by first name in the guest's language. Calmer motion when the phone asks for reduced motion.
8. **Hall screen:** QR code plus live counts of male, female, VIP, researchers signed, total registered and present today. Aggregates only, no names.
9. **Researchers:** the owner imports the official list (Excel/CSV). Columns: `name_ar`, `name_en` (may be empty), `email`, `phone` (optional), `gender` (optional), `institution`, `research_title`. One row per researcher per paper. Doctors cannot add names that aren't on the list.
10. **Researcher sign-off:** the doctor searches by name (Arabic or English, tolerant of أ/إ/ا, ة/ه, ى/ي and diacritics), picks the row, reviews the details, and the researcher signs on the tablet and confirms. The signature is stored privately as PNG plus the raw pen strokes (JSON), along with a SHA-256 hash, the time, the doctor and the device. It's kept for at least 1 year, and only the owner can delete it. The certificate is queued immediately.
11. **Documents:** guests get a **card**; researchers get a **certificate** that includes the research title. The owner uploads both designs later (PNG, JPG or PDF) and places the text with a click-to-place studio. If a design isn't uploaded yet, jobs wait and are sent when it arrives.
12. **On/off switches** per event: registration open, cards sending, certificates sending. Turning a switch off keeps the jobs; turning it on releases them.
13. **Email only**, through Resend from a domain the owner controls. Subject and body come in Arabic and English versions; each person gets the version in their own language.
14. **Exports:** Excel. Column labels and fixed values (gender, type) all in one chosen language. Researcher names come from the official list in the chosen language, falling back to the other column if that one is empty. Guest names stay exactly as typed, with no automatic translation.
15. **VIP:** a single flag that admins can toggle on guests and researchers. It's counted on the hall screen. VIP-specific certificates come later.
16. **Security:**
    - Sign-ups are disabled. Staff are invited only by the owner.
    - Admins and the owner must pass a TOTP code (authenticator app).
    - Idle logout after 15 minutes for admins and 30 minutes for doctors.
    - Every table has row-level security with no direct access; everything goes through checked functions. Signatures and templates are private.
    - Secrets live only in Vercel and Supabase settings.
    - Security headers are set, and the public pages don't link to the admin area.
    - Every admin action is written to an audit log.
17. **Design:** academic and professional, following the conference identity in the flyers: navy background with a dotted pattern, white, burgundy, and gold-yellow as an accent. IBM Plex Sans Arabic / IBM Plex Sans. Logos: the conference mark (redrawn as SVG), the university crest and the ministry seal (originals requested; upscaled as a fallback). Long names must never overflow.

## 3. Out of scope for this release
VIP-specific certificates, WhatsApp, a public certificate verification page, the staff/team items from the sketch.

## 4. Must never happen
- A registration, signature or email job is lost because a service was down.
- A certificate or card is sent twice to the same person for the same item.
- Anyone without the owner's invitation reads personal data.
- Text runs outside the card or certificate.
