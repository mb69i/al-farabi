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
const TYPES: Record<string, string> = { '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };

export type Sponsor = { name: string; logo?: string }; // logo: path under the repo, e.g. certs/sponsors/x.png
export type RenderOptions = { sponsors?: Sponsor[]; template?: string };
export type Rendered = { png: Buffer; jpg: Buffer; pdf: Buffer; url: string; serial: string; name: { lines: number; fits: boolean } };

let templateCache: string | null = null;
const loadTemplate = async () => (templateCache ??= await readFile(resolve(ROOT, 'certs/template.html'), 'utf8'));

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function sponsorSlots(list: Sponsor[] | undefined): { html: string; files: Map<string, string> } {
  const files = new Map<string, string>();
  const items = list?.length ? list : [1, 2, 3, 4].map(() => ({ name: '' }) as Sponsor); // empty slots until logos are given
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
        : u.pathname.startsWith('/forma/') ? resolve(ROOT, 'certs/forma', u.pathname.slice(7))
        : u.pathname.startsWith('/brand/') ? resolve(ROOT, 'public/brand', u.pathname.slice(7)) : null);
    if (!file || /\.\./.test(u.pathname)) return route.fulfill({ status: 404, body: '' });
    try {
      return route.fulfill({ status: 200, contentType: TYPES[extname(file)] ?? 'application/octet-stream', body: await readFile(file) });
    } catch {
      return route.fulfill({ status: 404, body: '' });
    }
  });
}

type Box = { x: number; y: number; width: number; height: number };

/** The QR area of a full-size image (in device pixels), with a margin for the quiet zone. */
function qrCrop(box: Box, width: number, height: number) {
  const pad = 24;
  const x0 = Math.max(0, Math.floor((box.x - pad) * SCALE));
  const y0 = Math.max(0, Math.floor((box.y - pad) * SCALE));
  const x1 = Math.min(width, Math.ceil((box.x + box.width + pad) * SCALE));
  const y1 = Math.min(height, Math.ceil((box.y + box.height + pad) * SCALE));
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}

function decodePngQr(png: PNG, box: Box): string | null {
  const { x0, y0, w, h } = qrCrop(box, png.width, png.height);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const from = ((y0 + y) * png.width + x0) * 4;
    out.set(png.data.subarray(from, from + w * 4), y * w * 4);
  }
  return jsQR(out, w, h)?.data ?? null;
}

/**
 * Flat PDF: one A4 page holding the JPEG (Chromium keeps it as DCTDecode, so it stays ~2 MB).
 * The QR is decoded once more from that JPEG, the exact image that gets printed.
 */
async function flatPdf(browser: Browser, jpg: Buffer, box: Box): Promise<{ pdf: Buffer; decoded: string | null }> {
  const page = await browser.newPage();
  try {
    await page.route('**/*', (r) => (r.request().url().startsWith('data:') ? r.continue() : r.abort()));
    await page.setContent(
      `<!doctype html><style>@page{size:297mm 210mm;margin:0}html,body{margin:0}img{display:block;width:297mm;height:210mm}</style>` +
        `<img id="cert" src="data:image/jpeg;base64,${jpg.toString('base64')}">`,
      { waitUntil: 'load' },
    );
    const raw = await page.evaluate(() => {
      const img = document.getElementById('cert') as HTMLImageElement;
      return { w: img.naturalWidth, h: img.naturalHeight };
    });
    const c = qrCrop(box, raw.w, raw.h);
    const pixels = await page.evaluate(({ x0, y0, w, h }) => {
      const img = document.getElementById('cert') as HTMLImageElement;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, x0, y0, w, h, 0, 0, w, h);
      return Array.from(ctx.getImageData(0, 0, w, h).data);
    }, c);
    const decoded = jsQR(Uint8ClampedArray.from(pixels), c.w, c.h)?.data ?? null;
    const pdf = await page.pdf({ width: '297mm', height: '210mm', printBackground: true, pageRanges: '1' });
    return { pdf, decoded };
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
    if (!state.fits) throw new CertificateError(`name or organisation too long to fit: ${input.name}`);
    if (state.overflow) throw new CertificateError('certificate text overflows the page');

    const png = await page.screenshot({ type: 'png', animations: 'disabled' });
    const box = await page.locator('#qr svg').boundingBox();
    if (!box) throw new CertificateError('QR missing from the page');
    const decoded = decodePngQr(PNG.sync.read(png), box);
    if (decoded !== url) throw new CertificateError(`QR check failed: decoded ${String(decoded)}, expected ${url}`);

    const jpg = await page.screenshot({ type: 'jpeg', quality: 95, animations: 'disabled' });
    const flat = await flatPdf(browser, jpg, box);
    if (flat.decoded !== url) throw new CertificateError(`QR check failed in the PDF image: decoded ${String(flat.decoded)}`);
    return { png, jpg, pdf: flat.pdf, url, serial: fields.SERIAL, name: { lines: state.lines, fits: state.fits } };
  } finally {
    await context.close();
  }
}
