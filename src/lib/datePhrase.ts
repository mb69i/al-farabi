import type { Lang } from '../i18n';

// Iraqi (Levantine) month names, as printed on the conference material.
const AR = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parts(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

/** "21 – 22 تشرين الثاني 2026" / "21–22 November 2026"; one day, or a range across months/years. */
export function datePhrase(fromIso: string, toIso: string, lang: Lang): string {
  const a = parts(fromIso);
  const b = parts(toIso);
  const months = lang === 'ar' ? AR : EN;
  const dash = lang === 'ar' ? ' – ' : '–';
  const wide = ' – ';
  if (a.y === b.y && a.m === b.m && a.d === b.d) return `${a.d} ${months[a.m - 1]} ${a.y}`;
  if (a.y === b.y && a.m === b.m) return `${a.d}${dash}${b.d} ${months[a.m - 1]} ${a.y}`;
  if (a.y === b.y) return `${a.d} ${months[a.m - 1]}${wide}${b.d} ${months[b.m - 1]} ${b.y}`;
  return `${a.d} ${months[a.m - 1]} ${a.y}${wide}${b.d} ${months[b.m - 1]} ${b.y}`;
}
