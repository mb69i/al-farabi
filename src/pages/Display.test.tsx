import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import type { Api, DisplayCounts } from '../lib/api';
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

describe('Display — day/night mode', () => {
  const theme = () => document.querySelector('.display')!.getAttribute('data-theme');
  function open(url: string) {
    window.history.pushState({}, '', url);
    return render(
      <I18nProvider initial="en">
        <Display api={api(vi.fn(async () => COUNTS))} slug="s" animate={false} />
      </I18nProvider>,
    );
  }
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('follows ?theme=night and ?theme=day in the link', async () => {
    const r = open('/display?lang=en&theme=night');
    await act(async () => {});
    expect(theme()).toBe('night');
    r.unmount();
    open('/display?lang=en&theme=day');
    await act(async () => {});
    expect(theme()).toBe('day');
  });

  it('when nothing is chosen, uses night from 6 pm to 6 am Baghdad time', async () => {
    vi.setSystemTime(new Date('2026-11-21T16:00:00Z')); // 19:00 in Baghdad
    const r = open('/display?lang=en');
    await act(async () => {});
    expect(theme()).toBe('night');
    r.unmount();
    vi.setSystemTime(new Date('2026-11-21T07:00:00Z')); // 10:00 in Baghdad
    open('/display?lang=en');
    await act(async () => {});
    expect(theme()).toBe('day');
  });

  it('the toggle switches mode and remembers it on this screen', async () => {
    vi.setSystemTime(new Date('2026-11-21T07:00:00Z'));
    const r = open('/display?lang=en');
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Night mode' }));
    expect(theme()).toBe('night');
    expect(localStorage.getItem('display-theme')).toBe('night');
    r.unmount();
    open('/display?lang=en');
    await act(async () => {});
    expect(theme()).toBe('night');
    fireEvent.click(screen.getByRole('button', { name: 'Day mode' }));
    expect(theme()).toBe('day');
  });

  it('N on the keyboard also switches mode', async () => {
    vi.setSystemTime(new Date('2026-11-21T07:00:00Z'));
    open('/display?lang=en');
    await act(async () => {});
    fireEvent.keyDown(window, { key: 'n' });
    expect(theme()).toBe('night');
  });

  it('shows the Baghdad time', async () => {
    vi.setSystemTime(new Date('2026-11-21T18:04:00Z'));
    open('/display?lang=en');
    await act(async () => {});
    expect(screen.getByTestId('clock')).toHaveTextContent('21:04');
  });

  it('shows the male/female split as one bar', async () => {
    open('/display?lang=en');
    await act(async () => {});
    expect(screen.getByRole('img', { name: 'Male 198 · Female 176' })).toBeInTheDocument();
  });
});
