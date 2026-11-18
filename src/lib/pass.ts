/** The guest's saved pass on this phone. Storage can be unavailable (private mode): never throw. */
export type Pass = { serial: string; firstName: string; phone: string; lang: 'ar' | 'en' };

const key = (slug: string) => `alfarabi-pass:${slug}`;

export function savePass(slug: string, p: Pass): void {
  try {
    localStorage.setItem(key(slug), JSON.stringify(p));
  } catch {
    /* storage unavailable: the pass simply is not remembered */
  }
}

export function loadPass(slug: string): Pass | null {
  try {
    const raw = localStorage.getItem(key(slug));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Pass>;
    return p && typeof p.serial === 'string' && typeof p.phone === 'string'
      ? { serial: p.serial, phone: p.phone, firstName: p.firstName ?? '', lang: p.lang === 'en' ? 'en' : 'ar' }
      : null;
  } catch {
    return null;
  }
}

/**
 * One phone may register up to 3 people (owner, 19 Nov): enough to fix a mistake or help a companion,
 * without one phone signing up a whole hall. Counted on the phone itself; "already registered" does not count.
 */
export const DEVICE_LIMIT = 3;
const countKey = (slug: string) => `alfarabi-device-count:${slug}`;

export function deviceCount(slug: string): number {
  try {
    const n = Number(localStorage.getItem(countKey(slug)));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

/** Records one more new registration from this phone and returns the new total. */
export function countDeviceRegistration(slug: string): number {
  const n = deviceCount(slug) + 1;
  try {
    localStorage.setItem(countKey(slug), String(n));
  } catch {
    /* storage unavailable: nothing is counted */
  }
  return n;
}

export function clearPass(slug: string): void {
  try {
    localStorage.removeItem(key(slug));
  } catch {
    /* ignore */
  }
}
