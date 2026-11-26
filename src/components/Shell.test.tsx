import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n';
import { Shell } from './Shell';

// TEDxBaghdad 2026 training at Al-Farabi (owner, 26 Nov): the TEDxBaghdad logo on a white plate (the logo is
// black-on-white), and the Al-Farabi crest as the host. No conference or Ministry logos.
describe('page header', () => {
  for (const variant of ['public', 'staff'] as const) {
    it(`shows the TEDxBaghdad logo on a white plate and the host crest (${variant} pages)`, () => {
      render(
        <I18nProvider initial="en">
          <Shell variant={variant}>x</Shell>
        </I18nProvider>,
      );
      const row = document.querySelector('.shell-logos') as HTMLElement;
      expect(row).toHaveAttribute('dir', 'ltr');
      const srcs = [...row.querySelectorAll('img')].map((i) => i.getAttribute('src'));
      expect(srcs).toEqual(['/brand/tedx-baghdad-720.png', '/brand/crest-192.png']);
      expect(row.querySelector('.tedx-plate img')).toHaveAttribute('alt', 'TEDxBaghdad');
      expect(screen.getByAltText('Al-Farabi University')).toBeInTheDocument();
    });
  }

  it('never shows the Ministry or the old conference logo, even where they were asked for', () => {
    render(
      <I18nProvider initial="en">
        <Shell variant="staff" ministry>
          x
        </Shell>
      </I18nProvider>,
    );
    expect(screen.queryByAltText('Ministry of Higher Education and Scientific Research')).toBeNull();
    expect(document.querySelector('img[src*="conference-logo"]')).toBeNull();
  });
});
