// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The hall screen's night look follows the certificate (owner, 19 Nov: "the background doesn't match the
// theme of the event"): the certificate's navy, its thin gold and burgundy frame lines, quiet gold dots;
// no blue or red glow patches.
const css = readFileSync(new URL('./Display.css', import.meta.url), 'utf8');
const night = css.slice(css.indexOf(".display[data-theme='night'] {"));
const block = night.slice(0, night.indexOf('\n}\n'));

describe('hall screen at night', () => {
  it('is the certificate navy, not the near-black page', () => {
    expect(block).toMatch(/--d-bg:\s*var\(--navy\);/);
  });

  it('has no coloured glow patches', () => {
    expect(block).not.toMatch(/rgba\(37, 78, 160/); // blue patch
    expect(block).not.toMatch(/rgba\(163, 38, 43, 0\.2\d\)/); // red patch
  });

  it("draws the certificate's frame: a gold line and a burgundy line just inside the edge", () => {
    expect(block).toMatch(/--d-frame:/);
    expect(block).toMatch(/#b8913a/i); // the certificate's gold
    expect(block).toMatch(/var\(--burgundy\)/);
    expect(css).toMatch(/box-shadow:\s*var\(--d-frame/);
  });
});
