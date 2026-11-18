// Phone-size screenshots of the app for review.
// Usage: node scripts/phone-shot.mjs <scenario> <out.png> [baseUrl]
// Scenarios: form, busy, thanks, display, display-live (day), display-night, display-phone, <page>-night, verify-ok, verify-missing, login
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
  { id: 'r1', name_ar: 'أحمد علي حسين (تجريبي)', name_en: 'Ahmed Ali Hussein (Demo)', institution: 'جامعة بغداد', research_title: 'تطبيقات الذكاء الاصطناعي في تشخيص أمراض القلب', signed: true },
  { id: 'r2', name_ar: 'أحمد كريم الجبوري', name_en: null, institution: 'جامعة الفارابي', research_title: 'تحليل البيانات الضخمة لتحسين جودة التعليم العالي في العراق', signed: false },
];

const SAMPLE_CONTACT = { phone: '0770 123 4567', email: 'info@alfarabiuc.edu.iq', location_ar: 'جامعة الفارابي — بغداد', location_en: 'Al-Farabi University — Baghdad' };

const fakeRpc = {
  footer: { get_site_contact: SAMPLE_CONTACT },
  controls: { whoami: { role: 'owner', aal: 'aal2', email: 'owner@example.org' }, get_site_contact: SAMPLE_CONTACT,
    admin_overview: { total: 0, present_today: 0, male: 0, female: 0, vip: 0, researchers_signed: 0, researchers_total: 0,
      switches: { registration_open: true, cards_enabled: false, certificates_enabled: false }, theme: 'auto', deliveries: [] } },
  'verify-ok': { verify_certificate: { status: 'valid', serial: 'ALF26-K7Q2-MXH4-P9TB', name: 'محمد الباقر علي', role: 'attendee',
    event_ar: 'مؤتمر الفارابي للبحوث التطبيقية في التحول الرقمي الشامل', event_en: 'Al-Farabi Conference on Applied Research in Comprehensive Digital Transformation',
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
  thanks: { register_guest: { status: 'created', serial: 'ALF26-K7Q2MX', checked_in_today: true } },
  researchers: { whoami: { role: 'doctor', aal: 'aal1', email: 'doctor@example.org' }, search_researchers: RESEARCHERS },
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
  const type = page.locator('input[name="guestType"][value="visitor"]');
  if (await type.count()) await type.click({ force: true });
  await page.click('button[type="submit"]');
}

const browser = await chromium.launch();
const isDisplay = scenario.startsWith('display') && scenario !== 'display-phone';
const isLive = ['display-live', 'display-night', 'display-phone'].includes(scenario);
const ctx = await browser.newContext(
  isDisplay
    ? { viewport: { width: 1280, height: 720 }, locale: 'ar-IQ' }
    : { ...devices['iPhone 13'], deviceScaleFactor: 2, locale: 'ar-IQ' },
);
const page = await ctx.newPage();
if (nightSite) await ctx.addInitScript(() => localStorage.setItem('site-theme', 'night'));
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

if (scenario === 'researchers' || scenario === 'admin' || scenario === 'controls' || scenario === 'backups') {
  const session = { access_token: fakeJwt(scenario === 'researchers' ? 'aal1' : 'aal2'), token_type: 'bearer', expires_in: 3600, expires_at: 4102444800,
    refresh_token: 'x', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'doctor@example.org',
      app_metadata: {}, user_metadata: {}, created_at: '2026-11-17T00:00:00Z' } };
  await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`sb-${REF}-auth-token`, JSON.stringify(session)]);
  await page.route('**/auth/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session.user) }));
}

const path = { display: '/display', 'display-live': '/display', 'display-night': '/display', 'display-phone': '/display', login: '/staff/login', researchers: '/researchers', admin: '/admin', controls: '/admin/switches', backups: '/admin/backups', 'verify-ok': '/verify?s=ALF26-K7Q2-MXH4-P9TB', 'verify-missing': '/verify?s=ALF26-ZZZZ-ZZZZ-ZZZZ' }[scenario] ?? '/';
if (!['researchers', 'admin', 'controls', 'backups'].includes(scenario)) {
  await page.goto(base + path, { waitUntil: 'networkidle' });
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
}
await page.goto(base + path, { waitUntil: 'networkidle' });
if (scenario === 'researchers') {
  await page.fill('#res-q', 'احمد');
  await page.waitForTimeout(1200);
}

if (scenario === 'busy' || scenario === 'thanks') {
  await fillForm(page);
  await page.waitForTimeout(scenario === 'thanks' ? 3500 : 800);
}
if (isDisplay || scenario === 'admin' || scenario === 'controls' || scenario === 'backups') await page.waitForTimeout(2000);
if (scenario === 'backups') {
  await page.getByRole('form').locator('input').fill('حاسوب المكتبة');
  await page.getByRole('form').getByRole('button').click();
  await page.waitForTimeout(800);
}
if (isLive) await page.waitForTimeout(3600); // second poll + bump in progress
if (scenario === 'footer') { await page.waitForTimeout(800); await page.locator('footer').scrollIntoViewIfNeeded(); }

await page.screenshot({ path: out, fullPage: ['form', 'admin', 'controls', 'backups'].includes(scenario) });
await browser.close();
console.log('saved', out);
