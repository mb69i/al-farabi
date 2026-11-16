import * as XLSX from 'xlsx';
import type { AdminExport } from './adminApi';

type Lang = 'ar' | 'en';

const L = {
  ar: {
    sheets: ['الضيوف', 'الباحثون', 'الحضور اليومي'],
    guests: ['الاسم', 'الرقم المرجعي', 'الهاتف', 'البريد الإلكتروني', 'الجنس', 'صفة الحضور', 'جهة العمل', 'التخصص', 'كبار الضيوف', 'لغة التسجيل', 'وقت التسجيل'],
    researchers: ['الاسم', 'البريد الإلكتروني', 'الهاتف', 'الجنس', 'الجهة', 'عنوان البحث', 'كبار الضيوف', 'وقت التوقيع', 'الطبيب'],
    checkins: ['الرقم المرجعي', 'الاسم', 'اليوم', 'الوقت'],
    gender: { male: 'ذكر', female: 'أنثى' },
    type: { visitor: 'زائر', student: 'طالب', other: 'أخرى' },
    yes: 'نعم',
    no: 'لا',
    lang: { ar: 'العربية', en: 'الإنجليزية' },
  },
  en: {
    sheets: ['Guests', 'Researchers', 'Check-ins'],
    guests: ['Name', 'Reference', 'Phone', 'Email', 'Gender', 'Attending as', 'Workplace', 'Specialisation', 'VIP', 'Language', 'Registered at'],
    researchers: ['Name', 'Email', 'Phone', 'Gender', 'Institution', 'Research title', 'VIP', 'Signed at', 'Doctor'],
    checkins: ['Reference', 'Name', 'Day', 'Time'],
    gender: { male: 'Male', female: 'Female' },
    type: { visitor: 'Visitor', student: 'Student', other: 'Other' },
    yes: 'Yes',
    no: 'No',
    lang: { ar: 'Arabic', en: 'English' },
  },
} as const;

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Baghdad', dateStyle: 'short', timeStyle: 'short' }) : '';

function sheet(rows: unknown[][], rtl: boolean): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = (rows[0] ?? []).map(() => ({ wch: 24 }));
  if (rtl) ws['!views'] = [{ RTL: true }];
  return ws;
}

/** One workbook, every label and fixed value in `lang`; guest names exactly as typed. */
export function buildExport(data: AdminExport, lang: Lang): XLSX.WorkBook {
  const l = L[lang];
  const rtl = lang === 'ar';
  const yn = (b: boolean) => (b ? l.yes : l.no);

  const guests = [
    [...l.guests],
    ...data.guests.map((g) => [
      g.full_name, g.serial, g.phone, g.email, l.gender[g.gender] ?? '', l.type[g.guest_type] ?? '',
      g.workplace, g.specialization, yn(g.is_vip), l.lang[g.lang] ?? '', when(g.created_at),
    ]),
  ];
  const researchers = [
    [...l.researchers],
    ...data.researchers.map((r) => [
      lang === 'en' ? r.name_en || r.name_ar : r.name_ar, r.email, r.phone ?? '',
      r.gender ? (l.gender[r.gender as 'male' | 'female'] ?? '') : '', r.institution ?? '', r.research_title,
      yn(r.is_vip), when(r.signed_at), r.doctor_name ?? '',
    ]),
  ];
  const checkins = [[...l.checkins], ...data.checkins.map((c) => [c.serial, c.full_name, c.day, when(c.at)])];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet(guests, rtl), l.sheets[0]);
  XLSX.utils.book_append_sheet(wb, sheet(researchers, rtl), l.sheets[1]);
  XLSX.utils.book_append_sheet(wb, sheet(checkins, rtl), l.sheets[2]);
  return wb;
}

export function exportFileName(lang: Lang, d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `alfarabi-conf-2026-${lang}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.xlsx`;
}

export function downloadExport(data: AdminExport, lang: Lang): void {
  XLSX.writeFile(buildExport(data, lang), exportFileName(lang));
}
