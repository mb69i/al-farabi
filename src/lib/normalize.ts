/**
 * Shared input normalisers. `normalizeArabicForSearch` must stay identical
 * to the SQL function `public.normalize_search` (see supabase/migrations).
 */

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';

function westernDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => {
    const i = ARABIC_INDIC.indexOf(d);
    return String(i >= 0 ? i : PERSIAN.indexOf(d));
  });
}

/** Returns E.164 (e.g. +9647701234567) or null when the number is not valid. */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  let s = westernDigits(raw).replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);

  if (s.startsWith('07')) {
    if (s.length !== 11) return null;
    s = '+964' + s.slice(1);
  } else if (/^7\d{9}$/.test(s)) {
    s = '+964' + s;
  } else if (/^964\d+$/.test(s)) {
    s = '+' + s;
  }

  if (s.startsWith('+9647') && s.length !== 14) return null;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizeEmail(raw: string): string | null {
  const s = (raw || '').trim().toLowerCase();
  if (s.length > 254 || !EMAIL_RE.test(s)) return null;
  return s;
}

const DOMAIN_FIXES: Record<string, string> = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gamil.com': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'yahooo.com': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'outlok.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'outllok.com': 'outlook.com',
};

/** Suggests a corrected address for common domain typos, or null. */
export function suggestEmailFix(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  const domain = email.slice(at + 1).toLowerCase();
  const fixed = DOMAIN_FIXES[domain];
  return fixed ? email.slice(0, at + 1) + fixed : null;
}

const ARABIC_LETTER = /[؀-ۿ]/;
const LATIN_LETTER = /[A-Za-z]/;

export function nameScript(name: string): 'ar' | 'en' | 'mixed' {
  const ar = ARABIC_LETTER.test(name);
  const en = LATIN_LETTER.test(name);
  if (ar && en) return 'mixed';
  return ar ? 'ar' : 'en';
}

/** Search key: lowercase, no diacritics/tatweel, unified alef/ta marbuta/ya forms. */
export function normalizeArabicForSearch(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}
