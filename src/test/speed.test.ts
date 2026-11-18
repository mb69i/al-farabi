// Speed rules for phones on mobile data (item 6). These read the deploy files directly.
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');

type Header = { key: string; value: string };
type Rule = { source: string; headers: Header[] };
const vercel = JSON.parse(read('vercel.json')) as { headers: Rule[] };
const headerFor = (source: string, key: string) =>
  vercel.headers.find((r) => r.source === source)?.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;

describe('page speed', () => {
  it('caches hashed build files for a year (they never change under the same name)', () => {
    expect(headerFor('/assets/(.*)', 'Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  it('caches brand images for a day and serves stale copies while refreshing', () => {
    expect(headerFor('/brand/(.*)', 'Cache-Control')).toMatch(/max-age=86400.*stale-while-revalidate/);
  });

  it('serves fonts from this site, not Google (no extra connections or render-blocking CSS)', () => {
    const html = read('index.html');
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
    const csp = headerFor('/(.*)', 'Content-Security-Policy') ?? '';
    expect(csp).not.toMatch(/googleapis|gstatic/);
  });

  it('uses small crest files on pages (the original is ~800 KB)', () => {
    for (const f of ['public/brand/crest-192.png', 'public/brand/crest-64.png']) {
      expect(statSync(resolve(root, f)).size).toBeLessThan(40 * 1024);
    }
    const sources = ['index.html', 'src/components/Shell.tsx', 'src/pages/Display.tsx'];
    for (const s of sources) expect(read(s), s).not.toMatch(/\/brand\/(crest|ministry)\.png/);
    // the hall screen's certificate-style logos are projector-size copies, not the ~800 KB originals
    for (const f of ['public/brand/crest-360.webp', 'public/brand/ministry-360.webp', 'public/brand/event-mark.webp']) {
      expect(statSync(resolve(root, f)).size, f).toBeLessThan(80 * 1024);
    }
    // the moving sponsors bar: the 68 logos (14 MB of PNGs) as one strip image, loaded once
    expect(statSync(resolve(root, 'public/brand/sponsors-strip.webp')).size).toBeLessThan(500 * 1024);
    expect(read('src/pages/sponsors.ts')).toMatch(/sponsors-strip\.webp/);
  });

  it('keeps supabase-js, qrcode and the staff screens out of the registration page bundle', () => {
    const app = read('src/App.tsx');
    expect(app).not.toMatch(/from '\.\/lib\/supabase'/);
    expect(app).not.toMatch(/from '\.\/pages\/(Display|Login|MfaSetup)'/);
    expect(read('src/lib/apiInstance.ts')).not.toMatch(/supabase/);
  });
});
