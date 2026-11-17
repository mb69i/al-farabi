// @vitest-environment node
// Real Chromium render. Needs PLAYWRIGHT_BROWSERS_PATH (D:\antigravity\.pw-browsers on the laptop); skipped elsewhere.
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderCertificate } from './render.ts';

const hasBrowser = Boolean(process.env.PLAYWRIGHT_BROWSERS_PATH);
const input = {
  name: 'الأستاذ الدكتور عبد الرحمن محمد صالح الجبوري العبيدي',
  org: 'جامعة تكنولوجيا المعلومات والاتصالات — كلية هندسة البرمجيات',
  role: 'researcher' as const,
  dateFrom: '2026-11-21',
  dateTo: '2026-11-22',
  serial: 'ALF26-7KQ2-M9XA-C4RT',
  verifyBase: 'https://al-farabi-gilt.vercel.app',
  variant: 'sponsors' as const,
};

describe.skipIf(!hasBrowser)('renderCertificate (Chromium)', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  it('A4 landscape at 300 dpi, the QR decodes to this person\'s verify link, and a flat PDF', async () => {
    const out = await renderCertificate(browser, input);
    const png = PNG.sync.read(out.png);
    expect([png.width, png.height]).toEqual([3508, 2480]);

    // decode the QR from the finished image independently of the engine's own check
    const found = jsQR(new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.length), png.width, png.height);
    expect(found?.data).toBe('https://al-farabi-gilt.vercel.app/verify?s=ALF26-7KQ2-M9XA-C4RT');
    expect(out.url).toBe(found?.data);

    const pdf = out.pdf.toString('latin1');
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf).toMatch(/\/Width 3508\b/); // one full-resolution image, no live text
    expect(pdf).not.toMatch(/\/Font\b/);
    expect(out.name).toEqual({ lines: expect.any(Number), fits: true });
  }, 60_000);

  it('a missing name never reaches the browser', async () => {
    await expect(renderCertificate(browser, { ...input, name: '' })).rejects.toThrow(/name/);
  });
});
