// The admin "Export to Excel" workbook: a summary plus guests, researchers (with their signatures as pictures
// inside the cells) and daily attendance — each sorted, with a navy header row, banded rows, frozen header,
// filters, sized columns, right-to-left for Arabic and landscape printing. Built with ExcelJS, which this
// module loads; the admin page imports this file only when Download is pressed.
import ExcelJS from 'exceljs';
import { governorateName } from '../lib/governorates';
import type { AdminExport, AdminResearcher } from './adminApi';

type Lang = 'ar' | 'en';
/** Returns the PNG bytes of a signature (from its storage path), or null. */
export type SignatureFetcher = (path: string) => Promise<Uint8Array | ArrayBuffer | null>;
export type ExportOptions = { now?: Date; signature?: SignatureFetcher };

const NAVY = 'FF14234B';
const BAND = 'FFF4F6FB';
const LINE = 'FFD9DDE8';
const MUTED = 'FF5A6378';
const HEADER_ROW = 3;
const BAGHDAD_MS = 3 * 3600_000; // UTC+3, no daylight saving

const L = {
  ar: {
    title: 'مؤتمر الفارابي الأول للبحوث التطبيقية في التحول الرقمي الشامل',
    sheets: ['الملخص', 'الضيوف', 'الباحثون', 'الحضور اليومي'],
    guests: ['#', 'الاسم', 'الرقم المرجعي', 'الهاتف', 'البريد الإلكتروني', 'الجنس', 'المحافظة', 'جهة العمل', 'التخصص', 'كبار الضيوف', 'أيام الحضور', 'وقت التسجيل', 'لغة التسجيل'],
    researchers: ['#', 'الاسم', 'البريد الإلكتروني', 'الهاتف', 'الجنس', 'الجهة', 'عنوان البحث', 'كبار الضيوف', 'وقّع', 'وقت التوقيع', 'الطبيب', 'التوقيع'],
    checkins: ['#', 'اليوم', 'الوقت', 'الاسم', 'الرقم المرجعي'],
    gender: { male: 'ذكر', female: 'أنثى' } as Record<string, string>,
    yes: 'نعم',
    no: 'لا',
    lang: { ar: 'العربية', en: 'الإنجليزية' } as Record<string, string>,
    count: (n: number, at: string) => `العدد: ${n} · صُدّر في ${at} (بتوقيت بغداد)`,
    noSignature: 'غير متاح',
    summary: {
      registered: 'المسجّلون', male: 'ذكور', female: 'إناث', vip: 'كبار الضيوف', researchers: 'الباحثون',
      signed: 'الباحثون الموقِّعون', of: 'من', perDay: 'الحضور حسب اليوم', day: 'اليوم', present: 'الحاضرون',
      item: 'البند', value: 'العدد',
    },
  },
  en: {
    title: 'The First Al-Farabi Conference on Applied Research in Comprehensive Digital Transformation',
    sheets: ['Summary', 'Guests', 'Researchers', 'Check-ins'],
    guests: ['#', 'Name', 'Reference', 'Phone', 'Email', 'Gender', 'Governorate', 'Workplace', 'Specialisation', 'VIP', 'Days present', 'Registered at', 'Language'],
    researchers: ['#', 'Name', 'Email', 'Phone', 'Gender', 'Institution', 'Research title', 'VIP', 'Signed', 'Signed at', 'Doctor', 'Signature'],
    checkins: ['#', 'Day', 'Time', 'Name', 'Reference'],
    gender: { male: 'Male', female: 'Female' } as Record<string, string>,
    yes: 'Yes',
    no: 'No',
    lang: { ar: 'Arabic', en: 'English' } as Record<string, string>,
    count: (n: number, at: string) => `Records: ${n} · exported ${at} (Baghdad time)`,
    noSignature: 'Not available',
    summary: {
      registered: 'Registered', male: 'Male', female: 'Female', vip: 'VIP guests', researchers: 'Researchers',
      signed: 'Researchers signed', of: 'of', perDay: 'Present per day', day: 'Day', present: 'Present',
      item: 'Item', value: 'Count',
    },
  },
} as const;

// (never exactly 9: ExcelJS drops a width equal to its default when saving)
const WIDTHS = {
  guests: [6, 30, 17, 18, 30, 11, 16, 28, 22, 14, 13, 19, 14],
  researchers: [6, 30, 28, 18, 11, 26, 44, 14, 10, 19, 22, 20],
  checkins: [6, 13, 10, 30, 17],
};
/** Short values (numbers, codes, yes/no, dates) are centred; names and text line up with the language. */
const CENTRED = {
  guests: [1, 3, 4, 6, 7, 10, 11, 12, 13],
  researchers: [1, 4, 5, 8, 9, 10, 12],
  checkins: [1, 2, 3, 5],
};

/** A Date whose UTC fields read as Baghdad local time, so Excel shows the Baghdad clock. */
const baghdad = (iso: string | null) => (iso ? new Date(Date.parse(iso) + BAGHDAD_MS) : null);
const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => {
  const b = new Date(d.getTime() + BAGHDAD_MS);
  return `${b.getUTCFullYear()}-${pad(b.getUTCMonth() + 1)}-${pad(b.getUTCDate())} ${pad(b.getUTCHours())}:${pad(b.getUTCMinutes())}`;
};

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Title, count line, header row; frozen header, filters, widths, right-to-left, landscape print. */
function listSheet(wb: ExcelJS.Workbook, name: string, headers: readonly string[], widths: number[], rtl: boolean,
  title: string, countLine: string): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: HEADER_ROW, rightToLeft: rtl }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.pageSetup.printTitlesRow = `${HEADER_ROW}:${HEADER_ROW}`;
  ws.columns = widths.map((width) => ({ width }));
  ws.mergeCells(1, 1, 1, headers.length);
  ws.mergeCells(2, 1, 2, headers.length);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { bold: true, size: 14, color: { argb: NAVY } };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 26;
  const c = ws.getCell(2, 1);
  c.value = countLine;
  c.font = { size: 10, color: { argb: MUTED } };
  c.alignment = { horizontal: 'center' };
  const h = ws.getRow(HEADER_ROW);
  headers.forEach((label, i) => {
    const cell = h.getCell(i + 1);
    cell.value = label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: 'FFA3262B' } } };
  });
  h.height = 30;
  ws.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: headers.length } };
  return ws;
}

/** Banded rows with thin borders; text stays text (phone numbers keep their +). */
function addRows(ws: ExcelJS.Worksheet, rows: unknown[][], rtl: boolean, centred: number[], formats: Record<number, string> = {}) {
  rows.forEach((values, i) => {
    const row = ws.getRow(HEADER_ROW + 1 + i);
    values.forEach((v, j) => {
      const cell = row.getCell(j + 1);
      cell.value = v as ExcelJS.CellValue;
      if (formats[j + 1]) cell.numFmt = formats[j + 1];
      cell.alignment = { vertical: 'middle', horizontal: centred.includes(j + 1) ? 'center' : rtl ? 'right' : 'left', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: LINE } } };
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } };
    });
  });
}

async function fetchSignatures(list: AdminResearcher[], fetcher?: SignatureFetcher): Promise<Map<string, Uint8Array | null>> {
  const out = new Map<string, Uint8Array | null>();
  if (!fetcher) return out;
  const paths = list.filter((r) => r.signed_at && r.signature_path).map((r) => r.signature_path as string);
  let next = 0;
  const worker = async () => {
    while (next < paths.length) {
      const p = paths[next++];
      try {
        const bytes = await fetcher(p);
        out.set(p, bytes ? (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) : null);
      } catch {
        out.set(p, null);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, paths.length) }, worker));
  return out;
}

export async function buildExport(data: AdminExport, lang: Lang, opts: ExportOptions = {}): Promise<ExcelJS.Workbook> {
  const l = L[lang];
  const rtl = lang === 'ar';
  const now = opts.now ?? new Date();
  const at = stamp(now);
  const yn = (b: boolean) => (b ? l.yes : l.no);
  const byName = (a: string, b: string) => a.localeCompare(b, lang);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Al-Farabi Conference';
  wb.created = now;

  // ---------- summary ----------
  const days = new Map<string, Set<string>>();
  for (const c of data.checkins) (days.get(c.day) ?? days.set(c.day, new Set()).get(c.day)!).add(c.serial);
  const signed = data.researchers.filter((r) => r.signed_at).length;
  const sum = wb.addWorksheet(l.sheets[0], { views: [{ rightToLeft: rtl }] });
  sum.columns = [{ width: 30 }, { width: 18 }];
  sum.mergeCells(1, 1, 1, 2);
  sum.getCell(1, 1).value = l.title;
  sum.getCell(1, 1).font = { bold: true, size: 14, color: { argb: NAVY } };
  sum.getCell(1, 1).alignment = { horizontal: 'center', wrapText: true };
  sum.getRow(1).height = 36;
  sum.mergeCells(2, 1, 2, 2);
  sum.getCell(2, 1).value = l.count(data.guests.length, at);
  sum.getCell(2, 1).font = { size: 10, color: { argb: MUTED } };
  sum.getCell(2, 1).alignment = { horizontal: 'center' };
  const s = l.summary;
  const pairs: Array<[string, string | number]> = [
    [s.registered, data.guests.length],
    [s.male, data.guests.filter((g) => g.gender === 'male').length],
    [s.female, data.guests.filter((g) => g.gender === 'female').length],
    [s.vip, data.guests.filter((g) => g.is_vip).length],
    [s.researchers, data.researchers.length],
    [s.signed, signed], // a plain number: "3 of 4" mixes up in right-to-left Excel
  ];
  const head = (row: number, a: string, b: string) => {
    [a, b].forEach((v, i) => {
      const cell = sum.getCell(row, i + 1);
      cell.value = v;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      cell.alignment = { horizontal: 'center' };
    });
  };
  head(4, s.item, s.value);
  pairs.forEach(([k, v], i) => {
    sum.getCell(5 + i, 1).value = k;
    sum.getCell(5 + i, 2).value = v;
    sum.getCell(5 + i, 2).alignment = { horizontal: 'center' };
    if (i % 2 === 1) [1, 2].forEach((c) => (sum.getCell(5 + i, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } }));
  });
  const dayRow = 5 + pairs.length + 1;
  head(dayRow, s.day, s.present);
  [...days.keys()].sort().forEach((d, i) => {
    sum.getCell(dayRow + 1 + i, 1).value = d;
    sum.getCell(dayRow + 1 + i, 2).value = days.get(d)!.size;
    sum.getCell(dayRow + 1 + i, 2).alignment = { horizontal: 'center' };
  });

  // ---------- guests (by name) ----------
  const present = new Map<string, number>();
  for (const [, serials] of days) for (const serial of serials) present.set(serial, (present.get(serial) ?? 0) + 1);
  const guests = [...data.guests].sort((a, b) => byName(a.full_name, b.full_name));
  const gs = listSheet(wb, l.sheets[1], l.guests, WIDTHS.guests, rtl, l.title, l.count(guests.length, at));
  addRows(gs, guests.map((g, i) => [
    i + 1, g.full_name, g.serial, g.phone, g.email, l.gender[g.gender] ?? '', governorateName(g.governorate, lang), g.workplace, g.specialization,
    yn(g.is_vip), present.get(g.serial) ?? 0, baghdad(g.created_at), l.lang[g.lang] ?? '',
  ]), rtl, CENTRED.guests, { 12: 'yyyy-mm-dd hh:mm' });

  // ---------- researchers (by name), signature pictures in their cells ----------
  const display = (r: AdminResearcher) => (lang === 'en' ? r.name_en || r.name_ar : r.name_ar);
  const researchers = [...data.researchers].sort((a, b) => byName(display(a), display(b)));
  const sigs = await fetchSignatures(researchers, opts.signature);
  const rs = listSheet(wb, l.sheets[2], l.researchers, WIDTHS.researchers, rtl, l.title, l.count(researchers.length, at));
  const sigCol = l.researchers.length;
  addRows(rs, researchers.map((r, i) => {
    const bytes = r.signature_path ? sigs.get(r.signature_path) : undefined;
    const sigText = !r.signed_at ? '—' : bytes ? '' : opts.signature ? l.noSignature : '';
    return [
      i + 1, display(r), r.email, r.phone ?? '', r.gender ? (l.gender[r.gender] ?? '') : '', r.institution ?? '',
      r.research_title, yn(r.is_vip), yn(Boolean(r.signed_at)), baghdad(r.signed_at), r.doctor_name ?? '', sigText,
    ];
  }), rtl, CENTRED.researchers, { 10: 'yyyy-mm-dd hh:mm' });
  researchers.forEach((r, i) => {
    const bytes = r.signature_path ? sigs.get(r.signature_path) : undefined;
    if (!bytes) return;
    const id = wb.addImage({ base64: `data:image/png;base64,${toBase64(bytes)}`, extension: 'png' });
    const row = HEADER_ROW + i; // 0-based row index of this researcher's row
    rs.addImage(id, { tl: { col: sigCol - 1 + 0.08, row: row + 0.1 }, ext: { width: 120, height: 46 }, editAs: 'oneCell' });
    rs.getRow(row + 1).height = 42;
  });

  // ---------- daily attendance (by day, then time) ----------
  const checkins = [...data.checkins].sort((a, b) => a.day.localeCompare(b.day) || a.at.localeCompare(b.at));
  const cs = listSheet(wb, l.sheets[3], l.checkins, WIDTHS.checkins, rtl, l.title, l.count(checkins.length, at));
  addRows(cs, checkins.map((c, i) => [i + 1, c.day, baghdad(c.at), c.full_name, c.serial]), rtl, CENTRED.checkins, { 3: 'hh:mm' });

  return wb;
}

export function exportFileName(lang: Lang, d = new Date()): string {
  return `alfarabi-conf-2026-${lang}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.xlsx`;
}

export async function downloadExport(data: AdminExport, lang: Lang, signature?: SignatureFetcher): Promise<void> {
  const wb = await buildExport(data, lang, { signature });
  const blob = new Blob([await wb.xlsx.writeBuffer()], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = exportFileName(lang);
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
