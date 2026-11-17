// Renders one certificate with Chromium: 300 dpi PNG (A4 landscape) plus a flat PDF holding that image.
// The QR is decoded back out of the finished PNG and must equal this person's verify link, or it fails.
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';
import type { Browser, Page } from 'playwright';
import { buildValues, CertificateError, fillTemplate, type CertificateInput } from './values.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ORIGIN = 'https://cert.local';
const CANVAS = { width: 1754, height: 1240 }; // css px; ×2 = 3508 × 2480 = A4 at 300 dpi
const SCALE = 2;
const TYPES: Record<string, string> = { '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

export type Sponsor = { name: string; logo?: string }; // logo: path under the repo, e.g. certs/sponsors/x.png
export type RenderOptions = { sponsors?: Sponsor[]; template?: string };
export type Rendered = { png: Buffer; pdf: Buffer; url: string; serial: string; name: { lines: number; fits: boolean } };

let templateCache: string | null = null;
const loadTemplate = async () => (templateCache ??= await readFile(resolve(ROOT, 'certs/template.html'), 'utf8'));

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function sponsorSlots(list: Sponsor[] | undefined): { html: string; files: Map<string, string> } {
  const files = new Map<string, string>();
  const items = list?.length ? list : [1, 2, 3, 4].map(() => ({ name: '' }) as Sponsor);
  const html = items
    .map((s, i) => {
      if (!s.logo) return `<span class="sponsor sponsor--empty">${s.name ? esc(s.name) : 'شعار الراعي'}</span>`;
      const key = `/sponsors/${i}${extname(s.logo)}`;
      files.set(key, resolve(ROOT, s.logo));
      return `<span class="sponsor"><img src="${key}" alt="${esc(s.name)}"></span>`;
    })
    .join('');
  return { html, files };
}

/** Serves the page and its local assets; anything else is refused, so no request leaves the machine. */
async function serve(page: Page, html: string, extra: Map<string, string>) {
  await page.route('**/*', async (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== ORIGIN) return route.abort();
    if (u.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    const file = extra.get(u.pathname) ??
      (u.pathname.startsWith('/fonts/') ? resolve(ROOT, 'engine/fonts', u.pathname.slice(7))
        : u.pathname.startsWith('/brand/') ? resolve(ROOT, 'public/brand', u.pathname.slice(7)) : null);
    if (!file || /\.\./.test(u.pathname)) return route.fulfill({ status: 404, body: '' });
    try {
      return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: await readFile(file) });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
}

function decodeQr(png: PNG, box: { x: number; y: number; width: number; height: number }): string | null {
  const pad = 24;
  const x0 = Math.max(0, Math.floor((box.x - pad) * SCALE));
  const y0 = Math.max(0, Math.floor((box.y - pad) * SCALE));
  const x1 = Math.min(png.width, Math.ceil((box.x + box.width + pad) * SCALE));
  const y1 = Math.min(png.height, Math.ceil((box.y + box.height + pad) * SCALE));
  const w = x1 - x0;
  const h = y1 - y0;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const from = ((y0 + y) * png.width + x0) * 4;
    out.set(png.data.subarray(from, from + w * 4), y * w * 4);
  }
  return jsQR(out, w, h)?.data ?? null;
}

async function flatPdf(browser: Browser, png: Buffer): Promise<Buffer> {
  const page = await browser.newPage();
  try {
    await page.route('**/*', (r) => (r.request().url().startsWith('data:') ? r.continue() : r.abort()));
    await page.setContent(
      `<!doctype html><style>@page{size:297mm 210mm;margin:0}html,body{margin:0}img{display:block;width:297mm;height:210mm}</style>` +
        `<img src="data:image/png;base64,${png.toString('base64')}">`,
      { waitUntil: 'load' },
    );
    return await page.pdf({ width: '297mm', height: '210mm', printBackground: true, pageRanges: '1' });
  } finally {
    await page.close();
  }
}

export async function renderCertificate(browser: Browser, input: CertificateInput, opts: RenderOptions = {}): Promise<Rendered> {
  const { url, fields } = buildValues(input); // throws on missing name/date/URL/serial before any browser work
  const qr = await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#14234B', light: '#FFFFFF' } });
  const sponsors = sponsorSlots(opts.sponsors);
  const html = fillTemplate(opts.template ?? (await loadTemplate()), { ...fields, QR: qr, SPONSORS: sponsors.html });

  const context = await browser.newContext({ viewport: CANVAS, deviceScaleFactor: SCALE, locale: 'ar-IQ' });
  try {
    const page = await context.newPage();
    await serve(page, html, sponsors.files);
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' });
    const state = await page.waitForFunction(() => (window as unknown as { __cert?: unknown }).__cert, null, { timeout: 15_000 })
      .then((h) => h.jsonValue() as Promise<{ lines: number; fits: boolean; fonts: boolean; images: boolean; overflow: boolean }>);
    if (!state.fonts) throw new CertificateError('certificate fonts did not load');
    if (!state.images) throw new CertificateError('a logo did not load');
    if (!state.fits) throw new CertificateError(`name too long to fit: ${input.name}`);
    if (state.overflow) throw new CertificateError('certificate text overflows the page');

    const png = await page.screenshot({ type: 'png', animations: 'disabled' });
    const box = await page.locator('#qr svg').boundingBox();
    if (!box) throw new CertificateError('QR missing from the page');
    const decoded = decodeQr(PNG.sync.read(png), box);
    if (decoded !== url) throw new CertificateError(`QR check failed: decoded ${String(decoded)}, expected ${url}`);

    const pdf = await flatPdf(browser, png);
    return { png, pdf, url, serial: fields.SERIAL, name: { lines: state.lines, fits: state.fits } };
  } finally {
    await context.close();
  }
}
