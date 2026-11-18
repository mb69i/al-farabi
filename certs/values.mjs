// What goes on a certificate, checked before anything is rendered. Any missing name, date,
// verify address or serial is a hard failure: a certificate is never printed half-filled.
// Plain JavaScript so the Vercel server function can load it as is (no TypeScript build step).

// Iraqi month names; must match src/lib/datePhrase.ts (a test checks both give the same words).
const AR_MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

/** "21 – 22 تشرين الثاني 2026"; one day, or a range across months/years (Arabic). */
export function arabicDateWords(fromIso, toIso) {
  const [ay, am, ad] = fromIso.slice(0, 10).split('-').map(Number);
  const [by, bm, bd] = toIso.slice(0, 10).split('-').map(Number);
  const wide = ' – ';
  if (ay === by && am === bm && ad === bd) return `${ad} ${AR_MONTHS[am - 1]} ${ay}`;
  if (ay === by && am === bm) return `${ad} – ${bd} ${AR_MONTHS[am - 1]} ${ay}`;
  if (ay === by) return `${ad} ${AR_MONTHS[am - 1]}${wide}${bd} ${AR_MONTHS[bm - 1]} ${by}`;
  return `${ad} ${AR_MONTHS[am - 1]} ${ay}${wide}${bd} ${AR_MONTHS[bm - 1]} ${by}`;
}

export class CertificateError extends Error {}

/**
 * @typedef {'attendee' | 'researcher'} Role
 * @typedef {'plain' | 'sponsors'} Variant
 * @typedef {{ name: string, org?: string | null, role: Role, dateFrom: string, dateTo: string,
 *             serial: string, verifyBase: string, variant: Variant }} CertificateInput
 *   org: workplace (guests) or institution (researchers), printed in brackets under the name.
 *   serial: from issue_certificate(); verifyBase: the QR opens <verifyBase>/verify?s=<serial>.
 */

/** Placeholders template.html must contain (QR and SPONSORS are filled with markup by the renderer). */
export const REQUIRED_PLACEHOLDERS = ['NAME', 'ORG_LINE', 'DATE_PHRASE', 'SERIAL', 'QR', 'VARIANT', 'SPONSORS'];

// Same shape as public.new_certificate_serial(): ALF26- and three groups of 4 from a 32-letter alphabet.
const SERIAL = /^[A-Z]{3}\d{2}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const tidy = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');

function isoDay(s) {
  const m = typeof s === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim()) : null;
  if (!m) throw new CertificateError(`missing or invalid date: ${String(s)}`);
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) {
    throw new CertificateError(`missing or invalid date: ${s}`);
  }
  return t;
}

/** "بتاريخ 2 تشرين الثاني 2026" for one day, "للفترة من 22 – 23 أيلول 2026" for several. */
export function certificateDatePhrase(from, to) {
  const a = isoDay(from);
  const b = isoDay(to);
  if (b < a) throw new CertificateError(`date range ends before it starts: ${from} → ${to}`);
  const words = arabicDateWords(from.trim(), to.trim());
  return a === b ? `بتاريخ ${words}` : `للفترة من ${words}`;
}

function verifyUrl(base, serial) {
  let u;
  try {
    u = new URL(tidy(base));
  } catch {
    throw new CertificateError(`missing or invalid verify URL: ${String(base)}`);
  }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname))) {
    throw new CertificateError(`verify URL must be https: ${String(base)}`);
  }
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}/verify?s=${serial}`;
}

/** @param {CertificateInput} input */
export function buildValues(input) {
  const name = tidy(input.name);
  if (name.length < 2) throw new CertificateError('missing name');
  const serial = tidy(input.serial).toUpperCase();
  if (!SERIAL.test(serial)) throw new CertificateError(`missing or invalid serial: ${String(input.serial)}`);
  if (input.variant !== 'plain' && input.variant !== 'sponsors') throw new CertificateError(`unknown variant: ${String(input.variant)}`);
  if (input.role !== 'attendee' && input.role !== 'researcher') throw new CertificateError(`unknown role: ${String(input.role)}`);
  const org = tidy(input.org).replace(/^\(\s*/, '').replace(/\s*\)$/, '');
  const url = verifyUrl(input.verifyBase, serial);
  return {
    url,
    fields: {
      NAME: escapeHtml(name),
      ORG_LINE: org ? escapeHtml(`(${org})`) : '',
      DATE_PHRASE: escapeHtml(certificateDatePhrase(input.dateFrom, input.dateTo)),
      SERIAL: serial,
      VARIANT: input.variant,
    },
  };
}

/** Replaces every {{KEY}}; a placeholder without a value is an error, never a blank. */
export function fillTemplate(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new CertificateError(`template placeholder has no value: ${key}`);
    return values[key];
  });
}
