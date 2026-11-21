import { normalizeArabicForSearch } from './normalize';
import type { ResearcherRow } from './staffApi';

/** A researcher as the signing desk keeps it on the phone: `key` holds names, paper ID and hall (no phone or email). */
export type DeskRow = ResearcherRow & { key: string };

const DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';

export function deskQuery(q: string): string {
  return normalizeArabicForSearch(
    q.replace(/[٠-٩۰-۹]/g, (d) => String(DIGITS.includes(d) ? DIGITS.indexOf(d) : PERSIAN.indexOf(d))),
  );
}

/** Phone numbers and emails are not kept on the phone, so those searches go to the server. */
export function needsServer(q: string): boolean {
  const s = deskQuery(q);
  if (s.includes('@')) return true;
  return /^[\d\s+()-]+$/.test(s) && s.replace(/\D/g, '').length >= 4;
}

export function filterLocal(list: DeskRow[], q: string, limit = 40): DeskRow[] {
  const s = deskQuery(q);
  if (s.length < 2) return [];
  const paperHit = (r: DeskRow) => (r.paper_code ?? '').toLowerCase().endsWith(s);
  return list
    .filter((r) => r.key.includes(s))
    .sort(
      (a, b) =>
        Number(paperHit(b)) - Number(paperHit(a)) ||
        Number(a.signed) - Number(b.signed) ||
        (a.paper_code ?? '￿').localeCompare(b.paper_code ?? '￿') ||
        a.name_ar.localeCompare(b.name_ar, 'ar'),
    )
    .slice(0, limit);
}
