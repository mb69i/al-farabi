/**
 * Iraq's 18 governorates (محافظات), plus "outside Iraq", in the order guests look for them.
 * The codes are what is stored; they must match the list in public.governorate_codes() in the database.
 */
export const GOVERNORATES = [
  { code: 'baghdad', ar: 'بغداد', en: 'Baghdad' },
  { code: 'basra', ar: 'البصرة', en: 'Basra' },
  { code: 'nineveh', ar: 'نينوى', en: 'Nineveh' },
  { code: 'erbil', ar: 'أربيل', en: 'Erbil' },
  { code: 'sulaymaniyah', ar: 'السليمانية', en: 'Sulaymaniyah' },
  { code: 'duhok', ar: 'دهوك', en: 'Duhok' },
  { code: 'kirkuk', ar: 'كركوك', en: 'Kirkuk' },
  { code: 'anbar', ar: 'الأنبار', en: 'Anbar' },
  { code: 'diyala', ar: 'ديالى', en: 'Diyala' },
  { code: 'salahaddin', ar: 'صلاح الدين', en: 'Salah al-Din' },
  { code: 'babil', ar: 'بابل', en: 'Babil' },
  { code: 'karbala', ar: 'كربلاء', en: 'Karbala' },
  { code: 'najaf', ar: 'النجف', en: 'Najaf' },
  { code: 'wasit', ar: 'واسط', en: 'Wasit' },
  { code: 'qadisiyah', ar: 'القادسية', en: 'Al-Qadisiyah' },
  { code: 'maysan', ar: 'ميسان', en: 'Maysan' },
  { code: 'dhiqar', ar: 'ذي قار', en: 'Dhi Qar' },
  { code: 'muthanna', ar: 'المثنى', en: 'Al-Muthanna' },
  { code: 'outside', ar: 'خارج العراق', en: 'Outside Iraq' },
] as const;

export type GovernorateCode = (typeof GOVERNORATES)[number]['code'];

/** The governorate's name in the chosen language; "—" for guests registered before the field existed. */
export function governorateName(code: string | null | undefined, lang: 'ar' | 'en'): string {
  const g = GOVERNORATES.find((x) => x.code === code);
  return g ? g[lang] : '—';
}
