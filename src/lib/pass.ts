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

export function clearPass(slug: string): void {
  try {
    localStorage.removeItem(key(slug));
  } catch {
    /* ignore */
  }
}
