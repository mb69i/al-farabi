// Hall screen fit check: at common projector/laptop window sizes nothing may be cut off, the
// column must be centred, and there must be no scrollbars. Exit 1 on any failure.
// Usage: node scripts/check-hall-fit.mjs [baseUrl]   (dev server or `vite preview`)
// Needs PLAYWRIGHT_BROWSERS_PATH pointing at the installed Chromium.
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://127.0.0.1:5175';
// Full-screen projectors, laptops with browser bars, zoomed windows, old 4:3 projectors.
const SIZES = [[1920, 1080], [1920, 950], [1600, 760], [1366, 640], [1333, 600], [1280, 720], [1280, 560], [1024, 768], [800, 600]];
const COUNTS = { total: 413, present_today: 288, male: 198, female: 177, vip: 23, researchers_signed: 64, researchers_total: 121 };

const browser = await chromium.launch();
const failures = [];
for (const theme of ['day', 'night']) {
  for (const [w, h] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, locale: 'ar-IQ' });
    const page = await ctx.newPage();
    await page.route('**/rest/v1/rpc/get_display_counts', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...COUNTS, theme }) }),
    );
    await page.goto(`${base}/display`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const box = (s) => document.querySelector(s)?.getBoundingClientRect();
      const stage = box('.d-stage');
      const parts = ['.d-logos', '.d-ribbon', '.d-title', '.qr-box', '.qr-caption', '.d-strip', '.d-corner', '.d-sponsors'].map((s) => [s, box(s)]);
      return {
        scrollW: document.documentElement.scrollWidth,
        scrollH: document.documentElement.scrollHeight,
        stageCentre: stage ? (stage.left + stage.right) / 2 : -1,
        stageHeight: stage ? stage.height : 0,
        parts: parts.map(([s, b]) => [s, b ? [b.left, b.top, b.right, b.bottom] : null]),
      };
    });
    const tag = `${theme} ${w}x${h}`;
    if (m.scrollW > w || m.scrollH > h) failures.push(`${tag}: scrollbars (${m.scrollW}x${m.scrollH})`);
    // headroom: other browsers' font metrics, zoom or a welcome message must not push it off screen
    if (m.stageHeight > h * 0.9) failures.push(`${tag}: column uses ${Math.round((m.stageHeight / h) * 100)}% of the height (max 90%)`);
    if (Math.abs(m.stageCentre - w / 2) > 2) failures.push(`${tag}: column not centred (${Math.round(m.stageCentre)} vs ${w / 2})`);
    for (const [s, b] of m.parts) {
      if (!b) failures.push(`${tag}: ${s} missing`);
      else if (b[0] < 0 || b[1] < 0 || b[2] > w || b[3] > h) failures.push(`${tag}: ${s} cut off ${b.map(Math.round)}`);
    }
    await ctx.close();
  }
}
await browser.close();
if (failures.length) {
  console.error('FAIL\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(`OK: ${SIZES.length * 2} window sizes`);
