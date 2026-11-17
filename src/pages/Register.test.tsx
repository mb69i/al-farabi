import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n';
import type { Api, RegisterResult } from '../lib/api';
import { loadPass, savePass } from '../lib/pass';
import { Register } from './Register';

function fakeApi(over: Partial<Api> = {}): Api {
  return {
    getPublicEvent: vi.fn(async () => ({ registration_open: true })),
    registerGuest: vi.fn(async (): Promise<RegisterResult> => ({
      status: 'created',
      serial: 'ALF26-ABC234',
      checked_in_today: true,
    })),
    checkinGuest: vi.fn(async () => ({ status: 'ok' as const, checked_in_today: true })),
    getDisplayCounts: vi.fn(),
    ...over,
  } as Api;
}

function setup(api: Api) {
  render(
    <I18nProvider initial="en">
      <Register api={api} slug="test-slug" />
    </I18nProvider>,
  );
}

function fill() {
  const set = (label: RegExp, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  set(/full name/i, 'Ali Hasan');
  set(/phone number/i, '07701234567');
  set(/^email/i, 'ali@gmail.com');
  set(/workplace/i, 'Baghdad University');
  set(/specialisation/i, 'Engineering');
  fireEvent.click(screen.getByLabelText('Male'));
}

beforeEach(() => localStorage.clear());

describe('Register', () => {
  it('does not ask "Attending as" and registers without it', async () => {
    const api = fakeApi();
    setup(api);
    await screen.findByLabelText(/full name/i);
    expect(screen.queryByText('Attending as')).toBeNull();
    expect(screen.queryByLabelText('Visitor')).toBeNull();
    fill();
    fireEvent.click(screen.getByRole('button', { name: /confirm registration/i }));
    await waitFor(() => expect(api.registerGuest).toHaveBeenCalled());
    expect((api.registerGuest as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toHaveProperty('guestType');
  });

  it('shows field errors on blur', async () => {
    setup(fakeApi());
    const phone = await screen.findByLabelText(/phone number/i);
    fireEvent.change(phone, { target: { value: '123' } });
    fireEvent.blur(phone);
    expect(await screen.findByText('This phone number is not valid')).toBeInTheDocument();
  });

  it('submit button stays locked while request is in flight', async () => {
    let resolve!: (r: RegisterResult) => void;
    const registerGuest = vi.fn(() => new Promise<RegisterResult>((r) => (resolve = r)));
    setup(fakeApi({ registerGuest }));
    await screen.findByLabelText(/full name/i);
    fill();
    const button = screen.getByRole('button', { name: /confirm registration/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(registerGuest).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    await act(async () => resolve({ status: 'created', serial: 'S', checked_in_today: true }));
  });

  it('created shows the robot and saves the pass', async () => {
    setup(fakeApi());
    await screen.findByLabelText(/full name/i);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /confirm registration/i }));
    expect(await screen.findByRole('img', { name: /robot/i })).toBeInTheDocument();
    expect(screen.getByText('ALF26-ABC234')).toBeInTheDocument();
    expect(loadPass('test-slug')?.serial).toBe('ALF26-ABC234');
  });

  it('already_registered shows robot and saved pass with day check-in', async () => {
    setup(
      fakeApi({
        registerGuest: vi.fn(async () => ({ status: 'already_registered' as const, serial: 'ALF26-OLD999', checked_in_today: true })),
      }),
    );
    await screen.findByLabelText(/full name/i);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /confirm registration/i }));
    expect(await screen.findByText(/already registered/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /robot/i })).toBeInTheDocument();
    expect(loadPass('test-slug')?.serial).toBe('ALF26-OLD999');
  });

  it('a saved pass shows on reload with a "record today" button', async () => {
    savePass('test-slug', { serial: 'ALF26-SAVED1', firstName: 'Ali', phone: '+9647701234567', lang: 'en' });
    const api = fakeApi();
    setup(api);
    const btn = await screen.findByRole('button', { name: /record today's attendance/i });
    fireEvent.click(btn);
    await waitFor(() => expect(api.checkinGuest).toHaveBeenCalledWith('test-slug', 'ALF26-SAVED1', '+9647701234567'));
    expect(await screen.findByText(/attendance today is recorded/i)).toBeInTheDocument();
  });

  it('closed shows closed panel', async () => {
    setup(fakeApi({ getPublicEvent: vi.fn(async () => ({ registration_open: false })) }));
    expect(await screen.findByText(/registration is closed/i)).toBeInTheDocument();
  });

  it('rate_limited result asks the guest to wait and keeps their answers', async () => {
    setup(fakeApi({ registerGuest: vi.fn(async () => ({ status: 'rate_limited' as const, checked_in_today: false })) }));
    await screen.findByLabelText(/full name/i);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /confirm registration/i }));
    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe('Ali Hasan');
  });

  it('closed result from the server also shows closed panel', async () => {
    setup(fakeApi({ registerGuest: vi.fn(async () => ({ status: 'closed' as const, checked_in_today: false })) }));
    await screen.findByLabelText(/full name/i);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /confirm registration/i }));
    expect(await screen.findByText(/registration is closed/i)).toBeInTheDocument();
  });

  it('email typo suggestion appears for gmial.com', async () => {
    setup(fakeApi());
    const email = await screen.findByLabelText(/^email/i);
    fireEvent.change(email, { target: { value: 'ali@gmial.com' } });
    fireEvent.blur(email);
    expect(await screen.findByText('Did you mean ali@gmail.com?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /use this/i }));
    expect((email as HTMLInputElement).value).toBe('ali@gmail.com');
  });

  it('honeypot filled shows the robot without calling the API', async () => {
    const api = fakeApi();
    setup(api);
    await screen.findByLabelText(/full name/i);
    fill();
    fireEvent.change(document.querySelector('input[name="website"]')!, { target: { value: 'spam' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm registration/i }));
    expect(await screen.findByRole('img', { name: /robot/i })).toBeInTheDocument();
    expect(api.registerGuest).not.toHaveBeenCalled();
  });

  it('server field error is shown on that field', async () => {
    setup(fakeApi({ registerGuest: vi.fn(async () => ({ status: 'invalid' as const, field: 'email', checked_in_today: false })) }));
    await screen.findByLabelText(/full name/i);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /confirm registration/i }));
    expect(await screen.findByText('This email address is not valid')).toBeInTheDocument();
  });

  it('network failure shows the error panel with retry', async () => {
    setup(fakeApi({ registerGuest: vi.fn(async () => { throw new Error('offline'); }) }));
    await screen.findByLabelText(/full name/i);
    fill();
    fireEvent.click(screen.getByRole('button', { name: /confirm registration/i }));
    expect(await screen.findByText(/could not be completed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe('Ali Hasan');
  });
});
