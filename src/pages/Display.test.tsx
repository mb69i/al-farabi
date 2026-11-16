import { act, render, screen } from '@testing-library/react';
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
