import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import { ApiError, type Api, type DisplayCounts } from '../lib/api';
import { Display } from './Display';

const COUNTS: DisplayCounts = {
  total: 412, present_today: 287, male: 198, female: 176, vip: 23, researchers_signed: 64, researchers_total: 121,
};

function api(getDisplayCounts: Api['getDisplayCounts']): Api {
  return { getDisplayCounts } as Api;
}

function setup(a: Api) {
  window.history.pushState({}, '', '/display?lang=en');
  render(
    <I18nProvider initial="en">
      <Display api={a} slug="s" pollMs={5000} animate={false} />
    </I18nProvider>,
  );
}

const value = (label: string) => screen.getByText(label).closest('.counter')!.querySelector('.counter-value')!.textContent;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Display', () => {
  it('renders the six counters from API', async () => {
    setup(api(vi.fn(async () => COUNTS)));
    await act(async () => {});
    expect(value('Male')).toBe('198');
    expect(value('Female')).toBe('176');
    expect(value('VIP guests')).toBe('23');
    expect(value('Researchers')).toBe('64');
    expect(value('Registered')).toBe('412');
    expect(value('Present today')).toBe('287');
  });

  it('keeps last values on failed poll and shows reconnecting', async () => {
    const fn = vi.fn().mockResolvedValueOnce(COUNTS).mockRejectedValue(new Error('offline'));
    setup(api(fn));
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(value('Male')).toBe('198');
    expect(screen.getByText('Reconnecting')).toBeInTheDocument();
  });

  it('defaults to Arabic and honours ?lang=en', async () => {
    window.history.pushState({}, '', '/display');
    const { unmount } = render(
      <I18nProvider initial="en">
        <Display api={api(vi.fn(async () => COUNTS))} slug="s" animate={false} />
      </I18nProvider>,
    );
    await act(async () => {});
    expect(screen.getByText('ذكور')).toBeInTheDocument();
    unmount();
    window.history.pushState({}, '', '/display?lang=en');
    render(
      <I18nProvider initial="ar">
        <Display api={api(vi.fn(async () => COUNTS))} slug="s" animate={false} />
      </I18nProvider>,
    );
    await act(async () => {});
    expect(screen.getByText('Male')).toBeInTheDocument();
    window.history.pushState({}, '', '/');
  });

  it('QR encodes site origin', async () => {
    setup(api(vi.fn(async () => COUNTS)));
    await act(async () => {});
    expect(screen.getByTestId('qr').getAttribute('data-target')).toBe(`${window.location.origin}/`);
  });
});

describe('Display — live feel (item 7)', () => {
  const card = (label: string) => screen.getByText(label).closest('.counter')!;

  async function twoPolls(next: Partial<DisplayCounts>) {
    const fn = vi.fn().mockResolvedValueOnce(COUNTS).mockResolvedValue({ ...COUNTS, ...next });
    setup(api(fn));
    await act(async () => {});
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    return fn;
  }

  it('pulses a counter and shows +N when its number goes up, then settles', async () => {
    await twoPolls({ total: 414, male: 200 });
    expect(value('Registered')).toBe('414');
    expect(card('Registered')).toHaveClass('counter--bump');
    expect(card('Registered').querySelector('.counter-delta')?.textContent).toBe('+2');
    expect(card('Male')).toHaveClass('counter--bump');
    expect(card('Female')).not.toHaveClass('counter--bump');
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(card('Registered')).not.toHaveClass('counter--bump');
  });

  it('celebrates a new registration with the guest number only (no names), not on first load', async () => {
    const fn = vi.fn().mockResolvedValueOnce(COUNTS).mockResolvedValue({ ...COUNTS, total: 413 });
    setup(api(fn));
    await act(async () => {});
    expect(screen.queryByTestId('moment')).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByTestId('moment')).toHaveTextContent('Welcome, guest no. 413');
    await act(async () => {
      vi.advanceTimersByTime(7000);
    });
    expect(screen.queryByTestId('moment')).toBeNull();
  });

  it('shows how long ago the last registration was', async () => {
    await twoPolls({ total: 413 });
    expect(screen.getByTestId('last-reg')).toHaveTextContent('Last registration: just now');
    await act(async () => {
      vi.advanceTimersByTime(125_000);
    });
    expect(screen.getByTestId('last-reg')).toHaveTextContent('Last registration: 2 min ago');
  });

  it('shows a live badge and researcher progress (signed of total)', async () => {
    setup(api(vi.fn(async () => COUNTS)));
    await act(async () => {});
    expect(screen.getByText('Live')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '64');
    expect(bar).toHaveAttribute('aria-valuemax', '121');
    expect(card('Researchers')).toHaveTextContent('of 121');
  });

  it('counts up from zero on start, but jumps straight to the number with reduced motion', async () => {
    const mm = (reduce: boolean) =>
      vi.fn((q: string) => ({ matches: reduce && q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {} }));
    const original = window.matchMedia;
    const run = async (reduce: boolean) => {
      window.matchMedia = mm(reduce) as unknown as typeof window.matchMedia;
      window.history.pushState({}, '', '/display?lang=en');
      const r = render(
        <I18nProvider initial="en">
          <Display api={api(vi.fn(async () => COUNTS))} slug="s" />
        </I18nProvider>,
      );
      await act(async () => {});
      const shown = value('Male');
      r.unmount();
      return shown;
    };
    try {
      expect(await run(false)).toBe('0');
      expect(await run(true)).toBe('198');
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('Display — day/night set by the admin', () => {
  const theme = () => document.querySelector('.display')!.getAttribute('data-theme');
  function open(fn: Api['getDisplayCounts']) {
    window.history.pushState({}, '', '/display?lang=en');
    return render(
      <I18nProvider initial="en">
        <Display api={api(fn)} slug="s" animate={false} />
      </I18nProvider>,
    );
  }

  it('uses the mode the admin chose, whatever the time', async () => {
    vi.setSystemTime(new Date('2026-11-21T07:00:00Z')); // 10:00 in Baghdad
    const r = open(vi.fn(async () => ({ ...COUNTS, theme: 'night' as const })));
    await act(async () => {});
    expect(theme()).toBe('night');
    r.unmount();
    vi.setSystemTime(new Date('2026-11-21T18:00:00Z')); // 21:00 in Baghdad
    open(vi.fn(async () => ({ ...COUNTS, theme: 'day' as const })));
    await act(async () => {});
    expect(theme()).toBe('day');
  });

  it('on automatic, uses night from 6 pm to 6 am Baghdad time', async () => {
    vi.setSystemTime(new Date('2026-11-21T16:00:00Z')); // 19:00
    const r = open(vi.fn(async () => ({ ...COUNTS, theme: 'auto' as const })));
    await act(async () => {});
    expect(theme()).toBe('night');
    r.unmount();
    vi.setSystemTime(new Date('2026-11-21T07:00:00Z')); // 10:00
    open(vi.fn(async () => COUNTS));
    await act(async () => {});
    expect(theme()).toBe('day');
  });

  it('switches within one poll when the admin changes it', async () => {
    vi.setSystemTime(new Date('2026-11-21T07:00:00Z'));
    open(vi.fn().mockResolvedValueOnce({ ...COUNTS, theme: 'day' }).mockResolvedValue({ ...COUNTS, theme: 'night' }));
    await act(async () => {});
    expect(theme()).toBe('day');
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(theme()).toBe('night');
  });

  it('has no day/night button on the hall screen, and N does nothing', async () => {
    vi.setSystemTime(new Date('2026-11-21T07:00:00Z'));
    open(vi.fn(async () => COUNTS));
    await act(async () => {});
    expect(screen.queryByRole('button', { name: /mode/i })).toBeNull();
    fireEvent.keyDown(window, { key: 'n' });
    expect(theme()).toBe('day');
  });

  it('shows the Baghdad time', async () => {
    vi.setSystemTime(new Date('2026-11-21T18:04:00Z'));
    open(vi.fn(async () => COUNTS));
    await act(async () => {});
    expect(screen.getByTestId('clock')).toHaveTextContent('21:04');
  });

  it('shows the male/female split as one bar', async () => {
    open(vi.fn(async () => COUNTS));
    await act(async () => {});
    expect(screen.getByRole('img', { name: 'Male 198 · Female 176' })).toBeInTheDocument();
  });

  it('says clearly when this copy of the site has no database settings', async () => {
    open(vi.fn(async () => {
      throw new ApiError('not configured', 500);
    }));
    await act(async () => {});
    expect(screen.getByRole('alert')).toHaveTextContent('This copy of the site is not connected to the database');
  });
});

describe('Display — centred layout like the previous event tool', () => {
  it('puts the QR code in the middle, then one small strip with all the numbers under it', async () => {
    setup(api(vi.fn(async () => COUNTS)));
    await act(async () => {});
    const stage = document.querySelector('.d-stage')!;
    const qr = screen.getByTestId('qr');
    const strip = document.querySelector('.d-strip')!;
    expect(stage).toContainElement(qr);
    expect(stage).toContainElement(strip as HTMLElement);
    // the QR comes before the numbers
    expect(qr.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const label of ['Registered', 'Present today', 'Male', 'Female', 'VIP guests', 'Researchers']) {
      expect(strip).toContainElement(screen.getByText(label));
    }
    expect(screen.getByText('Scan to register your attendance')).toBeInTheDocument();
  });
});

describe('Display — header and sponsors like the certificate', () => {
  it('shows the three logos in the certificate order: Al-Farabi, the event mark in the middle, the Ministry', async () => {
    setup(api(vi.fn(async () => COUNTS)));
    await act(async () => {});
    const row = document.querySelector('.d-logos') as HTMLElement;
    expect(row).toHaveAttribute('dir', 'ltr'); // same left-to-right order as the printed certificate
    const srcs = [...row.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(srcs).toEqual(['/brand/crest-360.webp', '/brand/event-mark.webp', '/brand/ministry-360.webp']);
    expect(screen.getByAltText('Al-Farabi University')).toBeInTheDocument();
    expect(screen.getByAltText('Ministry of Higher Education and Scientific Research')).toBeInTheDocument();
  });

  it('carries the certificate ribbon: the Arabic title and its English line', async () => {
    setup(api(vi.fn(async () => COUNTS)));
    await act(async () => {});
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('مؤتمر الفارابي الأول للبحوث التطبيقية في التحول الرقمي الشامل');
    expect(screen.getByText('The First Al-Farabi Conference on Applied Research in Comprehensive Digital Transformation')).toBeInTheDocument();
  });

  it('shows the certificate sponsors band along the bottom, outside the centred column', async () => {
    setup(api(vi.fn(async () => COUNTS)));
    await act(async () => {});
    const footer = screen.getByRole('contentinfo');
    expect(document.querySelector('.d-stage')).not.toContainElement(footer);
    const band = footer.querySelector('img')!;
    expect(band).toHaveAttribute('src', '/brand/sponsors-band.webp'); // cut from the owner's sponsors certificate
    expect(band.getAttribute('alt')).toContain('Sponsors & Partners');
    expect(footer.querySelectorAll('.d-sponsor--empty')).toHaveLength(0);
  });

  it('falls back to marked empty slots (no invented sponsors) if the band is removed', async () => {
    window.history.pushState({}, '', '/display?lang=en');
    render(
      <I18nProvider initial="en">
        <Display api={api(vi.fn(async () => COUNTS))} slug="s" animate={false} sponsorBand={null} />
      </I18nProvider>,
    );
    await act(async () => {});
    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent('Sponsored by');
    expect(footer.querySelectorAll('.d-sponsor--empty')).toHaveLength(4);
    expect(footer.querySelectorAll('img')).toHaveLength(0);
  });
});
