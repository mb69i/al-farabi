// Phone-on-mobile-data load check (Lighthouse-style throttling with Playwright + CDP).
// Usage: node scripts/perf-check.mjs [baseUrl] [path ...]
// Serve a production build first: npx vite preview --port 4175 --host 127.0.0.1
// Needs PLAYWRIGHT_BROWSERS_PATH pointing at the installed Chromium.
import { chromium, devices } from '@playwright/test';

const [, , base = 'http://127.0.0.1:4175', ...paths] = process.argv;
const PATHS = paths.length ? paths : ['/', '/display', '/verify?s=ALF26-TEST00'];

// "Slow 4G" as Lighthouse uses it: 150 ms RTT, 1.6 Mbit/s down, 750 kbit/s up, CPU slowed 4x.
const NET = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };

const browser = await chromium.launch();
const RUNS = Number(process.env.RUNS || 3);
const samples = [];
for (const path of PATHS) for (let run = 0; run < RUNS; run += 1) {
  const ctx = await browser.newContext({ ...devices['Pixel 5'], locale: 'ar-IQ' });
  const page = await ctx.newPage();
  // Never touch the real database while measuring: every RPC gets a canned answer.
  await page.route('**/rest/v1/rpc/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(null) }),
  );
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', NET);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  let bytes = 0;
  let requests = 0;
  cdp.on('Network.loadingFinished', (e) => {
    bytes += e.encodedDataLength;
    requests += 1;
  });

  await page.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  const t0 = Date.now();
  await page.goto(base + path, { waitUntil: 'load', timeout: 120000 });
  const loadMs = Date.now() - t0;
  await page.waitForLoadState('networkidle', { timeout: 120000 });
  const idleMs = Date.now() - t0 - 500; // networkidle = 500 ms with no requests
  const m = await page.evaluate(() => ({
    fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0,
    lcp: window.__lcp,
  }));
  samples.push({ path, fcp: Math.round(m.fcp), lcp: Math.round(m.lcp), load: loadMs, idle: idleMs, kb: Math.round(bytes / 1024), requests });
  await ctx.close();
}
await browser.close();
// Median of the runs for each page (single runs on a throttled link are noisy).
const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const rows = PATHS.map((path) => {
  const s = samples.filter((x) => x.path === path);
  const row = { path };
  for (const k of ['fcp', 'lcp', 'load', 'idle', 'kb', 'requests']) row[k] = median(s.map((x) => x[k]));
  return row;
});
console.table(rows);
