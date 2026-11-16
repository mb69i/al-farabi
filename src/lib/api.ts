import { normalizeEmail, normalizePhone } from './normalize';

/** The subset of the Supabase client this module needs (makes it testable). */
export type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
    status: number;
  }>;
};

export type Gender = 'male' | 'female';
export type GuestType = 'visitor' | 'student' | 'other';

export type GuestInput = {
  fullName: string;
  phone: string;
  email: string;
  gender: Gender;
  guestType: GuestType;
  workplace: string;
  specialization: string;
  lang: 'ar' | 'en';
};

export type RegisterResult = {
  status: 'created' | 'already_registered' | 'closed' | 'invalid';
  serial?: string;
  field?: string;
  checked_in_today: boolean;
};

export type CheckinResult = { status: 'ok' | 'not_found' | 'closed'; checked_in_today: boolean };

export type PublicEvent = {
  slug?: string;
  name_ar?: string;
  name_en?: string;
  starts_on?: string;
  ends_on?: string;
  registration_open: boolean;
};

export type DisplayCounts = {
  total: number;
  present_today: number;
  male: number;
  female: number;
  vip: number;
  researchers_signed: number;
  researchers_total: number;
};

export type Api = {
  getPublicEvent: (slug: string) => Promise<PublicEvent>;
  registerGuest: (input: GuestInput) => Promise<RegisterResult>;
  checkinGuest: (slug: string, serial: string, phone: string) => Promise<CheckinResult>;
  getDisplayCounts: (slug: string) => Promise<DisplayCounts>;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Opts = { attempts?: number; sleep?: (ms: number) => Promise<void> };

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createApi(client: RpcClient, defaultSlug: string, opts: Opts = {}): Api {
  const attempts = opts.attempts ?? 3;
  const sleep = opts.sleep ?? defaultSleep;

  async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        const { data, error, status } = await client.rpc(fn, args);
        if (!error) return data as T;
        if (status > 0 && status < 500) throw new ApiError(error.message, status);
        lastErr = new ApiError(error.message, status);
      } catch (e) {
        if (e instanceof ApiError && e.status > 0 && e.status < 500) throw e;
        lastErr = e;
      }
      if (i < attempts - 1) await sleep(400 * 2 ** i);
    }
    throw lastErr instanceof Error ? lastErr : new Error('request failed');
  }

  return {
    getPublicEvent: (slug) => call<PublicEvent>('get_public_event', { p_slug: slug || defaultSlug }),
    registerGuest: (g) =>
      call<RegisterResult>('register_guest', {
        p_slug: defaultSlug,
        p_full_name: g.fullName.replace(/\s+/g, ' ').trim(),
        p_phone: normalizePhone(g.phone) ?? g.phone.trim(),
        p_email: normalizeEmail(g.email) ?? g.email.trim(),
        p_gender: g.gender,
        p_guest_type: g.guestType,
        p_workplace: g.workplace.trim(),
        p_specialization: g.specialization.trim(),
        p_lang: g.lang,
      }),
    checkinGuest: (slug, serial, phone) =>
      call<CheckinResult>('checkin_guest', { p_slug: slug || defaultSlug, p_serial: serial, p_phone: phone }),
    getDisplayCounts: (slug) => call<DisplayCounts>('get_display_counts', { p_slug: slug || defaultSlug }),
  };
}
