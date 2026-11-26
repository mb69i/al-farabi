import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n';
import { Shell } from './Shell';

// TEDxBaghdad 2026 training at Al-Farabi (owner, 26 Nov). Public pages sit on the violet poster band, so the logo is
// the white one (as on the theme artwork); staff pages are white, so the original logo goes on a white plate.
// The Al-Farabi crest is the host. No conference or Ministry logos.
describe('page header', () => {
  it('public pages: the white TEDxBaghdad logo straight on the violet, then the host crest', () => {
    render(
      <I18nProvider initial="en">
        <Shell>x</Shell>
      </I18nProvider>,
    );
    const row = document.querySelector('.shell-logos') as HTMLElement;
    expect(row).toHaveAttribute('dir', 'ltr');
    const srcs = [...row.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(srcs).toEqual(['/brand/tedx-baghdad-white-720.png', '/brand/crest-192.png']);
    expect(row.querySelector('.tedx-plate')).toBeNull();
    expect(screen.getByAltText('TEDxBaghdad')).toBeInTheDocument();
    expect(screen.getByAltText('Al-Farabi University')).toBeInTheDocument();
  });

  it('staff pages: the original logo on a white plate, then the host crest', () => {
    render(
      <I18nProvider initial="en">
        <Shell variant="staff">x</Shell>
      </I18nProvider>,
    );
    const row = document.querySelector('.shell-logos') as HTMLElement;
    const srcs = [...row.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(srcs).toEqual(['/brand/tedx-baghdad-720.png', '/brand/crest-192.png']);
    expect(row.querySelector('.tedx-plate img')).toHaveAttribute('alt', 'TEDxBaghdad');
  });

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
