// Phone-size screenshots of the app for review.
// Usage: node scripts/phone-shot.mjs <scenario> <out.png> [baseUrl]
// Scenarios: form, confirm (the "confirm your details" step), limit (a phone that registered 3 people), busy, thanks, display, display-live (day), display-night, display-phone, <page>-night, verify-ok, verify-missing, login
// Needs PLAYWRIGHT_BROWSERS_PATH pointing at the installed Chromium.
import { chromium, devices } from '@playwright/test';

const [, , rawScenario = 'form', out = 'shot.png', base = 'http://127.0.0.1:5175'] = process.argv;
// "<page>-night" (not the hall screen) = that page with the visitor's night button pressed.
const nightSite = rawScenario.endsWith('-night') && !rawScenario.startsWith('display');
const scenario = nightSite ? rawScenario.slice(0, -'-night'.length) : rawScenario;

// Screenshot-only fake staff session (never sent to the real database: every call it makes is mocked).
const REF = 'kxwimaslalczappzngci';
function fakeJwt(aal) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u1', aal, role: 'authenticated', exp: 4102444800 })}.x`;
}
const RESEARCHERS = [
  { id: 'r1', name_ar: 'أحمد علي حسين (تجريبي)', name_en: 'Ahmed Ali Hussein (Demo)', institution: 'جامعة بغداد', research_title: 'تطبيقات الذكاء الاصطناعي في تشخيص أمراض القلب', signed: true, paper_code: 'DEMO-1', hall: 'L_102' },
  { id: 'r2', name_ar: 'أحمد كريم الجبوري', name_en: null, institution: 'جامعة الفارابي', research_title: 'تحليل البيانات الضخمة لتحسين جودة التعليم العالي في العراق', signed: false, paper_code: 'ARCDT26-007', hall: 'L_102' },
];

const SAMPLE_CONTACT = { phone: '0770 123 4567', email: 'info@alfarabiuc.edu.iq', location_ar: 'جامعة الفارابي — بغداد', location_en: 'Al-Farabi University — Baghdad' };

const fakeRpc = {
  footer: { get_site_contact: SAMPLE_CONTACT },
  controls: { whoami: { role: 'owner', aal: 'aal2', email: 'owner@example.org' }, get_site_contact: SAMPLE_CONTACT,
    admin_overview: { total: 0, present_today: 0, male: 0, female: 0, vip: 0, researchers_signed: 0, researchers_total: 0,
      switches: { registration_open: true, cards_enabled: false, certificates_enabled: false }, theme: 'auto', deliveries: [] } },
  'verify-ok': { verify_certificate: { status: 'valid', serial: 'ALF26-K7Q2-MXH4-P9TB', name: 'محمد الباقر علي', role: 'attendee',
    event_ar: 'مؤتمر الفارابي الأول للبحوث التطبيقية في التحول الرقمي الشامل', event_en: 'The First Al-Farabi Conference on Applied Research in Comprehensive Digital Transformation',
    date_from: '2026-11-21', date_to: '2026-11-22' } },
  'verify-missing': { verify_certificate: { status: 'not_found' } },
  backups: {
    whoami: { role: 'owner', aal: 'aal2', email: 'owner@example.org' },
    admin_list_backup_devices: [
      { id: 'd1', label: 'laptop-1', enabled: true, paired: true, pair_expires_at: null, last_seen_at: new Date(Date.now() - 2 * 60000).toISOString(), created_at: '2026-11-17T08:00:00Z' },
      { id: 'd2', label: 'حاسوب الاستقبال', enabled: true, paired: true, pair_expires_at: null, last_seen_at: new Date(Date.now() - 40 * 60000).toISOString(), created_at: '2026-11-18T08:00:00Z' },
      { id: 'd3', label: 'لابتوب العمادة', enabled: false, paired: false, pair_expires_at: new Date(Date.now() + 20 * 60000).toISOString(), last_seen_at: null, created_at: '2026-11-18T09:00:00Z' },
    ],
    admin_add_backup_device: { id: 'd9', label: 'حاسوب المكتبة', code: 'K7Q2-MXH4', expires_at: new Date(Date.now() + 30 * 60000).toISOString() },
  },
  busy: { register_guest: { status: 'rate_limited', checked_in_today: false } },
  'thanks-already': { register_guest: { status: 'already_registered', serial: 'ALF26-9YQ83D', checked_in_today: true } },
  thanks: { register_guest: { status: 'created', serial: 'ALF26-K7Q2MX', checked_in_today: true } },
  researchers: { whoami: { role: 'doctor', aal: 'aal1', email: 'doctor@example.org' }, search_researchers: RESEARCHERS },
  // the desk right after a signature: back at the search while it saves (21 Nov)
  'researchers-saving': { whoami: { role: 'doctor', aal: 'aal1', email: 'doctor@example.org' }, search_researchers: RESEARCHERS,
    get_public_event: { id: '00000000-0000-0000-0000-000000000001', slug: 'alfarabi-conf-2026' } },
  'admin-researchers': { whoami: { role: 'owner', aal: 'aal2', email: 'owner@example.org' },
    admin_list_researchers: { total: 0, rows: [] } },
  admin: {
    whoami: { role: 'owner', aal: 'aal2', email: 'owner@example.org' },
    admin_overview: { total: 412, present_today: 287, male: 198, female: 176, vip: 23, researchers_signed: 64,
      researchers_total: 121, switches: { registration_open: true, cards_enabled: false, certificates_enabled: false },
      deliveries: [{ kind: 'card', status: 'disabled', count: 412 }, { kind: 'certificate', status: 'sent', count: 60 },
        { kind: 'certificate', status: 'failed', count: 4 }] },
  },
};

async function fillForm(page) {
  await page.fill('#f-fullName', 'محمد الباقر علي');
  await page.fill('#f-phone', '0770 123 4567');
  await page.fill('#f-email', 'guest@example.org');
  await page.click('input[name="gender"][value="male"]', { force: true });
  await page.fill('#f-workplace', 'جامعة الفارابي');
  await page.fill('#f-specialization', 'هندسة الذكاء الاصطناعي');
  if (await page.locator('#f-governorate').count()) await page.selectOption('#f-governorate', 'baghdad');
  const type = page.locator('input[name="guestType"][value="visitor"]');
  if (await type.count()) await type.click({ force: true });
  await page.click('button[type="submit"]');
}

/** Second press, on the "confirm your details" screen (when the form has one). */
async function confirmForm(page) {
  const btn = page.locator('.reg-confirm .btn-primary');
  if (await btn.count()) await btn.click();
}

const browser = await chromium.launch();
const isDisplay = scenario.startsWith('display') && scenario !== 'display-phone';
const isLive = ['display-live', 'display-night', 'display-phone'].includes(scenario);
// RECORD_VIDEO=<folder>: also save a .webm of the page (to show animation); RECORD_SECONDS sets how long to keep it.
const video = process.env.RECORD_VIDEO;
const ctx = await browser.newContext({
  ...(isDisplay
    ? { viewport: { width: 1280, height: 720 }, locale: 'ar-IQ' }
    : { ...devices['iPhone 13'], deviceScaleFactor: 2, locale: 'ar-IQ' }),
  ...(video ? { recordVideo: { dir: video, size: isDisplay ? { width: 1280, height: 720 } : { width: 390, height: 844 } } } : {}),
});
const page = await ctx.newPage();
if (nightSite) await ctx.addInitScript(() => localStorage.setItem('site-theme', 'night'));
if (scenario === 'limit') await ctx.addInitScript(() => localStorage.setItem('alfarabi-device-count:alfarabi-conf-2026', '3'));
for (const [fn, body] of Object.entries(fakeRpc[scenario] ?? {})) {
  await page.route(`**/rest/v1/rpc/${fn}`, (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

if (isLive) {
  // Hall screen just after a new registration: the first poll after load returns higher numbers
  // (dev StrictMode calls twice on mount, and the page is opened twice).
  let calls = 0;
  const base0 = { total: 412, present_today: 287, male: 198, female: 176, vip: 23, researchers_signed: 64, researchers_total: 121 };
  await page.route('**/rest/v1/rpc/get_display_counts', (r) => {
    calls += 1;
    const theme = scenario === 'display-night' ? 'night' : 'day';
    const body = { ...(calls <= 4 ? base0 : { ...base0, total: 413, present_today: 288, female: 177 }), theme };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

const isRes = scenario.startsWith('researchers');
if (isRes) await page.route('**/storage/v1/object/**', async (r) => { await new Promise((ok) => setTimeout(ok, 30000)); r.fulfill({ status: 200, body: '{}' }); });
if (isRes || scenario === 'admin' || scenario === 'admin-researchers' || scenario === 'controls' || scenario === 'backups') {
  const session = { access_token: fakeJwt(isRes ? 'aal1' : 'aal2'), token_type: 'bearer', expires_in: 3600, expires_at: 4102444800,
    refresh_token: 'x', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'doctor@example.org',
      app_metadata: {}, user_metadata: {}, created_at: '2026-11-17T00:00:00Z' } };
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  await page.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session.user) }));
}

const path = { display: '/display', 'display-live': '/display', 'display-night': '/display', 'display-phone': '/display', login: '/staff/login', researchers: '/researchers', 'researchers-saving': '/researchers', admin: '/admin', 'admin-researchers': '/admin/researchers', controls: '/admin/switches', backups: '/admin/backups', 'verify-ok': '/verify?s=ALF26-K7Q2-MXH4-P9TB', 'verify-missing': '/verify?s=ALF26-ZZZZ-ZZZZ-ZZZZ' }[scenario] ?? '/';
if (!isRes && !['admin', 'admin-researchers', 'controls', 'backups'].includes(scenario)) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
}
await page.goto(base + path, { waitUntil: 'networkidle' });
if (isRes) {
  await page.fill('#res-q', 'احمد');
  await page.waitForTimeout(1200);
}
if (scenario === 'researchers-saving') {
  await page.locator('.res-row:not([disabled])').first().click();
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + 40, box.y + box.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 12; k++) await page.mouse.move(box.x + 40 + k * 18, box.y + box.height / 2 + (k % 2 ? -25 : 25));
  await page.mouse.up();
  await page.locator('.res-confirm').click();
  await page.waitForTimeout(600);
  await page.fill('#res-q', 'ARCDT26-007');
  await page.waitForTimeout(1200);
}

if (scenario === 'confirm') {
  await fillForm(page);
  await page.waitForTimeout(500);
}
if (scenario === 'busy' || scenario.startsWith('thanks')) {
  await fillForm(page);
  await confirmForm(page);
  await page.waitForTimeout(scenario.startsWith('thanks') ? 3500 : 800);
}
if (isDisplay || scenario === 'admin' || scenario === 'controls' || scenario === 'backups') await page.waitForTimeout(2000);
if (scenario === 'backups') {
  await page.getByRole('form').locator('input').fill('حاسوب المكتبة');
  await page.getByRole('form').getByRole('button').click();
  await page.waitForTimeout(800);
}
if (isLive) await page.waitForTimeout(3600); // second poll + bump in progress
if (scenario === 'footer') { await page.waitForTimeout(800); await page.locator('footer').scrollIntoViewIfNeeded(); }

// FOCUS=<css selector>: frame just that element (e.g. FOCUS=.robot-scene for the thank-you robot).
if (process.env.FOCUS) {
  await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), process.env.FOCUS);
  await page.waitForTimeout(300);
  await page.locator(process.env.FOCUS).screenshot({ path: out });
} else {
  await page.screenshot({ path: out, fullPage: ['form', 'confirm', 'admin', 'controls', 'backups'].includes(scenario) });
}
if (video) {
  await page.waitForTimeout(Number(process.env.RECORD_SECONDS ?? 6) * 1000);
  await ctx.close(); // writes the video
  console.log('video ->', await page.video().path());
}
await browser.close();
console.log('saved', out);
