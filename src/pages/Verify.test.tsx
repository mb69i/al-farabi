import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import type { Api, VerifyResult } from '../lib/api';
import { Verify } from './Verify';

const VALID: VerifyResult = {
  status: 'valid', serial: 'ALF26-ABCD-EFGH-JKLM', name: 'Zainab Hassan', role: 'researcher',
  event_ar: 'مؤتمر الفارابي', event_en: 'Al-Farabi Conference', date_from: '2026-11-21', date_to: '2026-11-22',
};

function setup(result: () => Promise<VerifyResult>, url = '/verify?s=ALF26-ABCD-EFGH-JKLM') {
  window.history.pushState({}, '', url);
  const verifyCertificate = vi.fn(result);
  render(
    <I18nProvider initial="en">
      <Verify api={{ verifyCertificate } as unknown as Api} />
    </I18nProvider>,
  );
  return verifyCertificate;
}

afterEach(() => window.history.pushState({}, '', '/'));

describe('Verify page', () => {
  it('shows a valid certificate with name, role, event and date only', async () => {
    const fn = setup(async () => VALID);
    await act(async () => {});
    expect(fn).toHaveBeenCalledWith('ALF26-ABCD-EFGH-JKLM');
    expect(screen.getByRole('status')).toHaveTextContent('Valid certificate');
    expect(screen.getByText('Zainab Hassan')).toBeInTheDocument();
    expect(screen.getByText('Researcher')).toBeInTheDocument();
    expect(screen.getByText('Al-Farabi Conference')).toBeInTheDocument();
    expect(screen.getByText('21–22 November 2026')).toBeInTheDocument();
  });

  it('says not found, with no details', async () => {
    setup(async () => ({ status: 'not_found' }));
    await act(async () => {});
    expect(screen.getByRole('alert')).toHaveTextContent('No certificate found');
    expect(screen.queryByText('Zainab Hassan')).toBeNull();
  });

  it('asks to wait when too many checks are made', async () => {
    setup(async () => ({ status: 'rate_limited' }));
    await act(async () => {});
    expect(screen.getByRole('alert')).toHaveTextContent('Too many checks');
  });

  it('says it could not check when the network fails', async () => {
    setup(async () => {
      throw new Error('offline');
    });
    await act(async () => {});
    expect(screen.getByRole('alert')).toHaveTextContent('could not check');
  });

  it('without a serial in the link, lets the visitor type one', async () => {
    const fn = setup(async () => VALID, '/verify');
    await act(async () => {});
    expect(fn).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Certificate number'), 'alf26-abcd-efgh-jklm');
    await userEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(fn).toHaveBeenCalledWith('ALF26-ABCD-EFGH-JKLM');
    expect(window.location.search).toBe('?s=ALF26-ABCD-EFGH-JKLM');
    expect(await screen.findByText('Zainab Hassan')).toBeInTheDocument();
  });
});
