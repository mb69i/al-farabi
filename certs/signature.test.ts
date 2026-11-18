// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

const root = new URL('..', import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root));

describe('the signatory signature on the certificate', () => {
  it('is in the template, above the signatory line', () => {
    const t = read('certs/template.html').toString('utf8');
    expect(t).toMatch(/<img[^>]+class="signature"[^>]+src="\/forma\/signature\.png"/);
  });

  it('is near-black pen ink on a transparent background (the green original recoloured)', () => {
    const png = PNG.sync.read(read('certs/forma/signature.png'));
    const at = (x: number, y: number) => png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4);
    expect(at(png.width - 2, png.height - 2)[3]).toBe(0); // background is transparent
    let ink = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      const [r, g, b, a] = png.data.subarray(i, i + 4);
      if (a > 200) {
        ink++;
        expect(Math.max(r, g, b)).toBeLessThan(60);
        expect(Math.abs(g - r)).toBeLessThan(20); // no green left
      }
    }
    expect(ink).toBeGreaterThan(5000);
  });

  it('is shipped with the server certificate function', () => {
    const cfg = JSON.parse(read('vercel.json').toString('utf8'));
    expect(cfg.functions['api/certificate.mjs'].includeFiles).toContain('certs/forma/signature.png');
  });
});
