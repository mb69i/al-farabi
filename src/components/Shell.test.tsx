import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n';
import { Shell } from './Shell';

// Owner, 20 Nov: the event logo on every page (registration, signing, admin, sign-in, certificate check).
// They all share this header.
describe('page header', () => {
  for (const variant of ['public', 'staff'] as const) {
    it(`shows the university crest and the official event logo (${variant} pages)`, () => {
      render(
        <I18nProvider initial="en">
          <Shell variant={variant}>x</Shell>
        </I18nProvider>,
      );
      expect(screen.getByAltText('Al-Farabi University')).toBeInTheDocument();
      const logos = [...document.querySelectorAll('.shell-logos img.event-logo')].map((i) => i.getAttribute('src'));
      // one for light pages, one for night mode; the stylesheet shows the right one
      expect(logos).toEqual(['/brand/conference-logo-light.svg', '/brand/conference-logo-dark.svg']);
      expect(screen.getAllByAltText('Al-Farabi Conference')).toHaveLength(1); // the hidden twin is decorative
    });
  }

  it('night mode swaps to the logo made for dark backgrounds', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');
    expect(css).toMatch(/:root\[data-theme='night'\] \.event-logo--light\s*\{\s*display:\s*none/);
    expect(css).toMatch(/:root\[data-theme='night'\] \.event-logo--dark\s*\{\s*display:\s*block/);
  });
});
