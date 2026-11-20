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

  // Owner, 20 Nov: the Ministry's logo too, on the registration and researcher pages (certificate order).
  it('registration (public pages) shows crest | event logo | Ministry, left to right', () => {
    render(
      <I18nProvider initial="en">
        <Shell>x</Shell>
      </I18nProvider>,
    );
    const row = document.querySelector('.shell-logos') as HTMLElement;
    expect(row).toHaveAttribute('dir', 'ltr');
    const srcs = [...row.querySelectorAll('img:not([aria-hidden])')].map((i) => i.getAttribute('src'));
    expect(srcs).toEqual(['/brand/crest-192.png', '/brand/conference-logo-light.svg', '/brand/ministry-360.webp']);
    expect(screen.getByAltText('Ministry of Higher Education and Scientific Research')).toBeInTheDocument();
  });

  it('staff pages show the Ministry only where asked (the researcher signing page)', () => {
    const { unmount } = render(
      <I18nProvider initial="en">
        <Shell variant="staff">x</Shell>
      </I18nProvider>,
    );
    expect(screen.queryByAltText('Ministry of Higher Education and Scientific Research')).toBeNull();
    unmount();
    render(
      <I18nProvider initial="en">
        <Shell variant="staff" ministry>
          x
        </Shell>
      </I18nProvider>,
    );
    expect(screen.getByAltText('Ministry of Higher Education and Scientific Research')).toBeInTheDocument();
  });

  it('night mode swaps to the logo made for dark backgrounds', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/styles/base.css'), 'utf8');
    expect(css).toMatch(/:root\[data-theme='night'\] \.event-logo--light\s*\{\s*display:\s*none/);
    expect(css).toMatch(/:root\[data-theme='night'\] \.event-logo--dark\s*\{\s*display:\s*block/);
  });
});
