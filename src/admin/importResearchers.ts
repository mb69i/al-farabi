import * as XLSX from 'xlsx';
import { normalizeArabicForSearch, normalizeEmail, normalizePhone } from '../lib/normalize';

export type ResearcherImportRow = {
  name_ar: string;
  name_en: string | null;
  email: string;
  phone: string | null;
  gender: 'male' | 'female' | null;
  institution: string | null;
  research_title: string;
};

export type ImportError = { row: number; message: 'name' | 'email' | 'phone' | 'research_title' };

type Col = keyof ResearcherImportRow;

const ALIASES: Record<Col, string[]> = {
  name_ar: ['name_ar', 'name ar', 'arabic name', 'الاسم', 'الاسم بالعربي', 'الاسم الكامل', 'اسم الباحث'],
  name_en: ['name_en', 'name en', 'english name', 'name', 'full name', 'الاسم بالانكليزي', 'الاسم بالانجليزي', 'الاسم بالانجليزية'],
  email: ['email', 'e-mail', 'e mail', 'mail', 'البريد', 'البريد الالكتروني', 'الايميل'],
  phone: ['phone', 'mobile', 'phone number', 'الهاتف', 'رقم الهاتف', 'الموبايل'],
  gender: ['gender', 'sex', 'الجنس'],
  institution: ['institution', 'affiliation', 'university', 'الجهه', 'الجامعه', 'جهه العمل', 'المؤسسه'],
  research_title: ['research_title', 'research title', 'title', 'paper title', 'paper', 'عنوان البحث', 'البحث'],
};

const norm = (h: unknown) => normalizeArabicForSearch(String(h ?? '').replace(/_/g, ' '));

const LOOKUP = new Map<string, Col>();
for (const [col, names] of Object.entries(ALIASES) as Array<[Col, string[]]>) {
  for (const n of names) LOOKUP.set(norm(n), col);
}

function gender(v: string): 'male' | 'female' | null {
  const s = normalizeArabicForSearch(v);
  if (['male', 'm', 'ذكر'].includes(s)) return 'male';
  if (['female', 'f', 'انثي'].includes(s)) return 'female';
  return null;
}

const text = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Excel stores '+989123456789' as the number 989123456789: put the '+' back for long foreign numbers. */
function phoneFromCell(raw: string): string | null {
  const digits = raw.replace(/\s+/g, '');
  // 10-15 digits without a leading 0 or + is an international number; a 10-digit number starting
  // with 7 stays an Iraqi local number without its 0 (normalizePhone handles that).
  const candidate = /^[1-9]\d{9,14}$/.test(digits) && !digits.startsWith('7') ? '+' + digits : raw;
  return normalizePhone(candidate);
}

export function parseResearcherSheet(file: ArrayBuffer): {
  rows: ResearcherImportRow[];
  errors: ImportError[];
  warnings: ImportError[];
} {
  const wb = XLSX.read(file, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: true, defval: '' });
  const [header = [], ...data] = table;
  const cols = header.map((h) => LOOKUP.get(norm(h)) ?? null);

  const rows: ResearcherImportRow[] = [];
  const errors: ImportError[] = [];
  const warnings: ImportError[] = [];
  data.forEach((cells, i) => {
    const rowNo = i + 2; // spreadsheet row number (header is row 1)
    const get = (c: Col) => {
      const idx = cols.indexOf(c);
      return idx >= 0 ? text(cells[idx]) : '';
    };
    if (!cells.some((c) => text(c))) return;

    const nameEn = get('name_en');
    const nameAr = get('name_ar') || nameEn;
    if (!nameAr) return void errors.push({ row: rowNo, message: 'name' });
    const email = normalizeEmail(get('email'));
    if (!email) return void errors.push({ row: rowNo, message: 'email' });
    const rawPhone = get('phone');
    const phone = rawPhone ? phoneFromCell(rawPhone) : null;
    if (rawPhone && !phone) warnings.push({ row: rowNo, message: 'phone' }); // phone is optional: keep the researcher
    const title = get('research_title');
    if (!title) return void errors.push({ row: rowNo, message: 'research_title' });

    rows.push({
      name_ar: nameAr,
      name_en: nameEn || null,
      email,
      phone,
      gender: gender(get('gender')),
      institution: get('institution') || null,
      research_title: title,
    });
  });
  return { rows, errors, warnings };
}
