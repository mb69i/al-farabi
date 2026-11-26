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

function renderPage(api: Api) {
  render(
    <I18nProvider initial="en">
      <Register api={api} slug="test-slug" />
    </I18nProvider>,
  );
}

/** The page opens on the event poster (owner, 26 Nov); most tests start on the form, one tap in. */
function setup(api: Api) {
  renderPage(api);
  const go = screen.queryByRole('button', { name: 'Register now' });
  if (go) fireEvent.click(go);
}

function fill() {
  const set = (label: RegExp, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  set(/full name/i, 'Ali Hasan Kareem');
  set(/phone number/i, '07701234567');
  set(/^email/i, 'ali@gmail.com');
  set(/workplace/i, 'Baghdad University');
  set(/which team/i, 'Media & Design'); // TEDx training (owner, 26 Nov): the team, typed freely
  set(/governorate/i, 'baghdad');
  fireEvent.click(screen.getByLabelText('Male'));
}

/** First press: check the details. */
const review = () => fireEvent.click(screen.getByRole('button', { name: /review my details/i }));
/** Second press, on the "confirm your details" screen. */
const confirm = async () => fireEvent.click(await screen.findByRole('button', { name: /confirm registration/i }));
const sendForm = async () => {
  review();
  await confirm();
};

beforeEach(() => localStorage.clear());

describe('Register', () => {
  it('does not ask "Attending as" and registers without it', async () => {
    const api = fakeApi();
    setup(api);
    await screen.findByLabelText(/full name/i);
    expect(screen.queryByText('Attending as')).toBeNull();
    expect(screen.queryByLabelText('Visitor')).toBeNull();
    fill();
    await sendForm();
    await waitFor(() => expect(api.registerGuest).toHaveBeenCalled());
    expect((api.registerGuest as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toHaveProperty('guestType');
    expect((api.registerGuest as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ governorate: 'baghdad' });
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
    review();
    const button = await screen.findByRole('button', { name: /confirm registration/i });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(registerGuest).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    await act(async () => resolve({ status: 'created', serial: 'S', checked_in_today: true }));
  });

  it('created shows the success card (no robot) and saves the pass', async () => {
    setup(fakeApi());
    await screen.findByLabelText(/full name/i);
    fill();
    await sendForm();
    expect(await screen.findByRole('heading', { name: /registered/i })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /robot/i })).toBeNull(); // the owner removed the robot (18 Nov)
    expect(screen.getByText('ALF26-ABC234')).toBeInTheDocument();
    expect(loadPass('test-slug')?.serial).toBe('ALF26-ABC234');
  });

  it('on the second day, a welcome-to-day-two card greets the registrant', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-11-22T07:00:00Z'), shouldAdvanceTime: true });
    try {
      setup(fakeApi({ getPublicEvent: vi.fn(async () => ({ registration_open: true, starts_on: '2026-11-21' })) }));
      await screen.findByLabelText(/full name/i);
      fill();
      await sendForm();
      const card = await screen.findByRole('status', { name: 'Welcome to day two' });
      expect(card).toHaveTextContent('Dear Ali,');
      expect(card).toHaveTextContent('Welcome to day two of TEDxBaghdad 2026 — What We Never Lost');
      expect(card).toHaveTextContent('Day two · 22 November 2026');
      expect(card).toHaveTextContent('Al-Farabi University');
      expect(card.querySelector('img')).toHaveAttribute('alt', 'Al-Farabi University');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the day-two card even when the event lookup fails (uses the built-in start date)', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-12-20T07:00:00Z'), shouldAdvanceTime: true });
    try {
      setup(fakeApi({
        getPublicEvent: vi.fn(async () => { throw new Error('offline'); }),
        registerGuest: vi.fn(async (): Promise<RegisterResult> => ({ status: 'already_registered', serial: 'ALF26-9YQ83D', checked_in_today: true })),
      }));
      await screen.findByLabelText(/full name/i);
      fill();
      await sendForm();
      expect(await screen.findByRole('status', { name: 'Welcome to day two' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('on the first day there is no day-two card', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-11-21T07:00:00Z'), shouldAdvanceTime: true });
    try {
      setup(fakeApi({ getPublicEvent: vi.fn(async () => ({ registration_open: true, starts_on: '2026-11-21' })) }));
      await screen.findByLabelText(/full name/i);
      fill();
      await sendForm();
      expect(await screen.findByText('You are registered')).toBeInTheDocument();
      expect(screen.queryByRole('status', { name: 'Welcome to day two' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('already_registered shows the saved pass with day check-in', async () => {
    setup(
      fakeApi({
        registerGuest: vi.fn(async () => ({ status: 'already_registered' as const, serial: 'ALF26-OLD999', checked_in_today: true })),
      }),
    );
    await screen.findByLabelText(/full name/i);
    fill();
    await sendForm();
    expect(await screen.findByText(/already registered/i)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /robot/i })).toBeNull();
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
    await sendForm();
    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe('Ali Hasan Kareem');
  });

  it('closed result from the server also shows closed panel', async () => {
    setup(fakeApi({ registerGuest: vi.fn(async () => ({ status: 'closed' as const, checked_in_today: false })) }));
    await screen.findByLabelText(/full name/i);
    fill();
    await sendForm();
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

  it('asks for the three-part name (first, father, grandfather) and refuses two words', async () => {
    const api = fakeApi();
    setup(api);
    await screen.findByLabelText(/full name/i);
    fill();
    for (const two of ['Ali Hasan', 'علي حسن', 'Dr. Ali Hasan', 'Ali  H  K']) {
      fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: two } });
      review();
      expect(await screen.findByText('Enter your full name: three names (first, father and grandfather)')).toBeInTheDocument();
    }
    expect(api.registerGuest).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: 'علي حسن كريم' } });
    await sendForm();
    await waitFor(() => expect(api.registerGuest).toHaveBeenCalled());
  });

  it('honeypot filled shows the success card without calling the API', async () => {
    const api = fakeApi();
    setup(api);
    await screen.findByLabelText(/full name/i);
    fill();
    fireEvent.change(document.querySelector('input[name="website"]')!, { target: { value: 'spam' } });
    review();
    expect(await screen.findByRole('heading', { name: /registered/i })).toBeInTheDocument();
    expect(api.registerGuest).not.toHaveBeenCalled();
  });

  it('server field error is shown on that field', async () => {
    setup(fakeApi({ registerGuest: vi.fn(async () => ({ status: 'invalid' as const, field: 'email', checked_in_today: false })) }));
    await screen.findByLabelText(/full name/i);
    fill();
    await sendForm();
    expect(await screen.findByText('This email address is not valid')).toBeInTheDocument();
  });

  it('network failure shows the error panel with retry', async () => {
    setup(fakeApi({ registerGuest: vi.fn(async () => { throw new Error('offline'); }) }));
    await screen.findByLabelText(/full name/i);
    fill();
    await sendForm();
    expect(await screen.findByText(/could not be completed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect((screen.getByLabelText(/full name/i) as HTMLInputElement).value).toBe('Ali Hasan Kareem');
  });
  it('asks for the governorate (18 + outside Iraq) and will not send without it', async () => {
    const api = fakeApi();
    setup(api);
    await screen.findByLabelText(/full name/i);
    fill();
    const select = screen.getByLabelText(/governorate/i) as HTMLSelectElement;
    const options = Array.from(select.options).filter((o) => o.value);
    expect(options).toHaveLength(19);
    expect(options.map((o) => o.textContent)).toEqual(expect.arrayContaining(['Baghdad', 'Basra', 'Outside Iraq']));
    fireEvent.change(select, { target: { value: '' } });
    review();
    expect(await screen.findByText('Please choose one')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm registration/i })).toBeNull();
    expect(api.registerGuest).not.toHaveBeenCalled();
  });

  it('shows "confirm your details" with everything entered; Edit goes back with the answers kept', async () => {
    const api = fakeApi();
    setup(api);
    await screen.findByLabelText(/full name/i);
    fill();
    review();
    const box = await screen.findByRole('region', { name: /confirm your details/i });
    for (const v of ['Ali Hasan Kareem', '+9647701234567', 'ali@gmail.com', 'Male', 'Baghdad', 'Baghdad University', 'Media & Design']) {
      expect(box).toHaveTextContent(v);
    }
    expect(api.registerGuest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^edit/i }));
    expect((await screen.findByLabelText(/full name/i) as HTMLInputElement).value).toBe('Ali Hasan Kareem');
    expect((screen.getByLabelText(/governorate/i) as HTMLSelectElement).value).toBe('baghdad');
    expect(api.registerGuest).not.toHaveBeenCalled();
  });

  it('a server error on the governorate is shown on that field', async () => {
    setup(fakeApi({ registerGuest: vi.fn(async () => ({ status: 'invalid' as const, field: 'governorate', checked_in_today: false })) }));
    await screen.findByLabelText(/full name/i);
    fill();
    await sendForm();
    expect(await screen.findByText('Please choose one')).toBeInTheDocument();
    expect(screen.getByLabelText(/governorate/i)).toHaveAttribute('aria-invalid', 'true');
  });

  it('one device can register up to 3 people (to fix a mistake), then asks the next person to use their own phone', async () => {
    let n = 0;
    const api = fakeApi({
      registerGuest: vi.fn(async () => ({ status: 'created' as const, serial: `ALF26-DEV00${++n}`, checked_in_today: true })),
    });
    setup(api);
    for (let i = 1; i <= 3; i++) {
      await screen.findByLabelText(/full name/i);
      fill();
      await sendForm();
      expect(await screen.findByText(`ALF26-DEV00${i}`)).toBeInTheDocument();
      if (i < 3) fireEvent.click(screen.getByRole('button', { name: /register someone else/i }));
    }
    expect(screen.queryByRole('button', { name: /register someone else/i })).toBeNull();
    expect(screen.getByText(/this phone has registered 3 people/i)).toBeInTheDocument();
    expect(api.registerGuest).toHaveBeenCalledTimes(3);
  });

  it('a device at its limit with no saved pass shows the limit, not the form', async () => {
    localStorage.setItem('alfarabi-device-count:test-slug', '3');
    setup(fakeApi());
    expect(await screen.findByText(/this phone has registered 3 people/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/full name/i)).toBeNull();
  });

  it('"already registered" does not use up one of the 3', async () => {
    setup(fakeApi({
      registerGuest: vi.fn(async () => ({ status: 'already_registered' as const, serial: 'ALF26-OLD999', checked_in_today: true })),
    }));
    await screen.findByLabelText(/full name/i);
    fill();
    await sendForm();
    expect(await screen.findByText(/already registered/i)).toBeInTheDocument();
    expect(localStorage.getItem('alfarabi-device-count:test-slug')).toBeNull();
  });
});

describe('Register — opens on the main event poster, then slides to the form (owner, 26 Nov)', () => {
  it('the first slide is the theme artwork with the date and Al-Rasheed Hotel, and no form yet', () => {
    renderPage(fakeApi());
    const hero = document.querySelector('.reg-hero') as HTMLElement;
    expect(hero.querySelector('.reg-year')).toHaveTextContent('2026THEME');
    expect(hero).toHaveTextContent('LOOK CLOSER!');
    expect(hero.querySelector('.reg-disc')).toHaveTextContent('It Was Always There!');
    expect(hero.querySelector('svg.reg-map')).not.toBeNull(); // the live dotted map
    expect(hero.querySelector('.baghdad')).not.toBeNull(); // the beating Baghdad dot
    const h1 = screen.getByRole('heading', { level: 1 });
    // the event and the theme on their own lines, no dangling dash
    expect([...h1.querySelectorAll('.reg-title-line')].map((l) => l.textContent)).toEqual(['TEDxBaghdad 2026', 'What We Never Lost']);
    expect(hero).toHaveTextContent('19 December 2026');
    expect(hero).toHaveTextContent('Al-Rasheed Hotel — Baghdad');
    expect(screen.queryByLabelText(/full name/i)).toBeNull();
  });

  it('Register now slides to the form, and Back to the poster slides back', async () => {
    renderPage(fakeApi());
    fireEvent.click(screen.getByRole('button', { name: 'Register now' }));
    expect(await screen.findByLabelText(/full name/i)).toBeInTheDocument();
    expect(document.querySelector('.reg-slide--form')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to the poster' }));
    expect(screen.getByRole('button', { name: 'Register now' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/full name/i)).toBeNull();
  });

  it('a sideways swipe on the poster slides to the form', async () => {
    renderPage(fakeApi());
    const slide = document.querySelector('.reg-slide--poster') as HTMLElement;
    fireEvent.touchStart(slide, { touches: [{ clientX: 300, clientY: 400 }] });
    fireEvent.touchEnd(slide, { changedTouches: [{ clientX: 120, clientY: 410 }] });
    expect(await screen.findByLabelText(/full name/i)).toBeInTheDocument();
  });

  it('a small vertical scroll is not a swipe', () => {
    renderPage(fakeApi());
    const slide = document.querySelector('.reg-slide--poster') as HTMLElement;
    fireEvent.touchStart(slide, { touches: [{ clientX: 200, clientY: 400 }] });
    fireEvent.touchEnd(slide, { changedTouches: [{ clientX: 170, clientY: 200 }] });
    expect(screen.queryByLabelText(/full name/i)).toBeNull();
  });

  it('the two dots show where you are and move between the slides', async () => {
    renderPage(fakeApi());
    const dots = screen.getAllByRole('button', { name: /^(Event poster|Registration)$/ });
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveAttribute('aria-current', 'true');
    fireEvent.click(dots[1]);
    expect(await screen.findByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Registration' })).toHaveAttribute('aria-current', 'true');
  });

  it('someone who already registered on this phone goes straight to their pass', async () => {
    savePass('test-slug', { serial: 'ALF26-ABC234', firstName: 'Ali', phone: '+9647701234567', lang: 'en' });
    renderPage(fakeApi());
    expect(screen.queryByRole('button', { name: 'Register now' })).toBeNull();
    expect(await screen.findByText('ALF26-ABC234')).toBeInTheDocument();
  });
});
