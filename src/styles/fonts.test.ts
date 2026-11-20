// @vitest-environment node
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The whole site uses Cairo (owner, 20 Nov): self-hosted, Arabic + Latin parts, one variable file per part.
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('Cairo everywhere', () => {
  it('is the site font, with a system fallback', () => {
    expect(read('./tokens.css')).toMatch(/--font:\s*'Cairo',/);
  });

  it('is self-hosted as small Arabic and Latin woff2 files covering every weight used (400–800)', () => {
    const css = read('./fonts.css');
    expect(css).toMatch(/font-family:\s*'Cairo'/);
    expect(css).toMatch(/font-weight:\s*400 800/);
    expect(css).toMatch(/cairo-arabic\.woff2/);
    expect(css).toMatch(/cairo-latin\.woff2/);
    expect(css).not.toMatch(/Plex/);
    for (const f of ['./fonts/cairo-arabic.woff2', './fonts/cairo-latin.woff2']) {
      const size = statSync(new URL(f, import.meta.url)).size;
      expect(size).toBeGreaterThan(5_000);
      expect(size).toBeLessThan(60_000);
    }
    expect(read('./fonts/OFL-cairo.txt')).toMatch(/SIL Open Font License/);
  });

  it('the hall screen uses it too (no Amiri download, no other font)', () => {
    const css = read('../pages/Display.css');
    expect(css).not.toMatch(/Amiri|Plex/);
  });
});
