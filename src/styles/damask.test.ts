import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Owner, 27 Nov: the background of the Al-Farabi x TEDxBaghdad poster — its navy damask at the flowers' own size,
// laid out so no part of the hall screen is left empty — on the hall screen and the public pages.
const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('damask background', () => {
  it('ships the damask repeat as one small web image', () => {
    expect(existsSync(resolve(process.cwd(), 'public/brand/damask.webp'))).toBe(true);
  });
  it('the hall screen lays it at the poster size, shifted so the middle is covered', () => {
    const css = read('src/pages/Display.css');
    expect(css).toMatch(/url\(\/brand\/damask\.webp\)\s+calc\(var\(--u\) \* 3\.75\)\s+calc\(var\(--u\) \* -3\.75\)\s*\/\s*calc\(var\(--u\) \* 56\) auto repeat/);
  });
  it('the public pages use it too, as big as the photo on a phone', () => {
    expect(read('src/styles/base.css')).toMatch(/url\(\/brand\/damask\.webp\) center top \/ min\(100vw, 720px\) auto repeat/);
  });
});
