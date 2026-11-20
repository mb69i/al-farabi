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
      const parts = ['.d-logos', '.d-patron', '.d-title', '.d-when', '.qr-box', '.qr-caption', '.d-strip', '.d-corner', '.d-sponsors', '.d-marquee'].map((s) => [s, box(s)]);
      return {
        scrollW: document.documentElement.scrollWidth,
        scrollH: document.documentElement.scrollHeight,
        stageCentre: stage ? (stage.left + stage.right) / 2 : -1,
        stageHeight: stage ? stage.height : 0,
        parts: parts.map(([s, b]) => [s, b ? [b.left, b.top, b.right, b.bottom] : null]),
        strip: box('.d-strip') ? [box('.d-strip').left, box('.d-strip').right] : null,
        // the counters must end above the sponsors bar (20 Nov: the taller agenda header pushed them into it)
        stripBottom: box('.d-strip')?.bottom ?? 0,
        sponsorsTop: box('.d-sponsors')?.top ?? Infinity,
        bar: box('.d-marquee') ? [box('.d-marquee').left, box('.d-marquee').right] : null,
        // vertical centres of every number in the strip (the owner marked the male/female numbers sitting higher)
        // one cell per number (plus the Live badge): equal widths, each number centred in its cell, and a divider
        // line on every cell boundary — the owner: "the break lines between every number should look perfect"
        cells: [...document.querySelectorAll('.d-strip > .d-live, .d-strip > .counter, .d-gender .counter')].map((c) => {
          const r = c.getBoundingClientRect();
          const v = c.querySelector('.counter-value')?.getBoundingClientRect() ?? r;
          const line = getComputedStyle(c, '::before');
          return { w: r.width, off: (v.left + v.right) / 2 - (r.left + r.right) / 2, line: line.content !== 'none' && line.width !== '0px' };
        }),
        numbers: [...document.querySelectorAll('.d-strip .counter-value')].map((e) => {
          const r = e.getBoundingClientRect();
          return (r.top + r.bottom) / 2;
        }),
      };
    });
    const tag = `${theme} ${w}x${h}`;
    if (m.scrollW > w || m.scrollH > h) failures.push(`${tag}: scrollbars (${m.scrollW}x${m.scrollH})`);
    // headroom: other browsers' font metrics, zoom or a welcome message must not push it off screen
    if (m.stageHeight > h * 0.9) failures.push(`${tag}: column uses ${Math.round((m.stageHeight / h) * 100)}% of the height (max 90%)`);
    if (m.stripBottom > m.sponsorsTop - 2) failures.push(`${tag}: counters overlap the sponsors bar (${Math.round(m.stripBottom)} > ${Math.round(m.sponsorsTop)})`);
    if (Math.abs(m.stageCentre - w / 2) > 2) failures.push(`${tag}: column not centred (${Math.round(m.stageCentre)} vs ${w / 2})`);
    // the owner: counters strip "same size as the block" — same left and right edges as the sponsors bar
    if (!m.strip || !m.bar) failures.push(`${tag}: counters strip or sponsors bar missing`);
    else if (Math.abs(m.strip[0] - m.bar[0]) > 2 || Math.abs(m.strip[1] - m.bar[1]) > 2) {
      failures.push(`${tag}: strip ${m.strip.map(Math.round)} vs sponsors bar ${m.bar.map(Math.round)} (edges must match)`);
    }
    if (m.numbers.length && Math.max(...m.numbers) - Math.min(...m.numbers) > 3) {
      failures.push(`${tag}: numbers not on one line (centres ${m.numbers.map(Math.round)})`);
    }
    if (m.cells.length === 6) {
      const ws = m.cells.map((c) => c.w);
      if (Math.max(...ws) - Math.min(...ws) > 2) failures.push(`${tag}: number cells not equal (${ws.map(Math.round)})`);
      if (m.cells.some((c) => Math.abs(c.off) > 2)) failures.push(`${tag}: a number is not centred in its cell (${m.cells.map((c) => Math.round(c.off))})`);
      if (m.cells.slice(1).some((c) => !c.line)) failures.push(`${tag}: a divider line is missing between two numbers`);
    } else {
      failures.push(`${tag}: expected 6 cells (Live + 5 numbers; no VIP since 19 Nov), found ${m.cells.length}`);
    }
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
