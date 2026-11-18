// @vitest-environment node
import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import type { AdminExport } from './adminApi';
import { buildExport, exportFileName } from './exportSheet';

const DATA: AdminExport = {
  guests: [
    {
      id: 'g1', serial: 'ALF26-AAA222', full_name: 'Ali Hasan Kareem', phone: '+9647701234567', email: 'a@x.org',
      gender: 'male', guest_type: 'student', workplace: 'UoB', specialization: 'CS', governorate: 'basra', lang: 'en', is_vip: true,
      created_at: '2026-11-21T07:00:00Z',
    },
    {
      id: 'g2', serial: 'ALF26-BBB333', full_name: 'زينب كاظم جواد', phone: '+9647801234567', email: 'z@x.org',
      gender: 'female', guest_type: 'visitor', workplace: 'جامعة بغداد', specialization: 'طب', lang: 'ar', is_vip: false,
      created_at: '2026-11-21T07:05:00Z',
    },
    {
      id: 'g3', serial: 'ALF26-CCC444', full_name: 'باسم علي حسين', phone: '+9647901234567', email: 'b@x.org',
      gender: 'male', guest_type: null, workplace: 'جامعة الفارابي', specialization: 'حاسوب', lang: 'ar', is_vip: false,
      created_at: '2026-11-22T06:30:00Z',
    },
  ],
  researchers: [
    {
      id: 'r1', name_ar: 'سارة محمود علي', name_en: null, email: 's@x.org', phone: null, gender: null,
      institution: null, research_title: 'T2', is_vip: false, signed_at: null, doctor_name: null, signature_path: null,
    },
    {
      id: 'r2', name_ar: 'أحمد علي حسن', name_en: 'Ahmed Ali Hasan', email: 'ah@x.org', phone: null, gender: 'male',
      institution: 'UoB', research_title: 'T1', is_vip: true, signed_at: '2026-11-21T09:00:00Z', doctor_name: 'Dr S',
      signature_path: 'signatures/e/r2/1.png',
    },
  ],
  checkins: [
    { serial: 'ALF26-CCC444', full_name: 'باسم علي حسين', day: '2026-11-22', at: '2026-11-22T06:30:00Z' },
    { serial: 'ALF26-AAA222', full_name: 'Ali Hasan Kareem', day: '2026-11-21', at: '2026-11-21T07:00:00Z' },
    { serial: 'ALF26-AAA222', full_name: 'Ali Hasan Kareem', day: '2026-11-22', at: '2026-11-22T06:00:00Z' },
  ],
};

// a valid 1x1 PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
const NOW = new Date('2026-11-22T10:00:00Z');

const text = (ws: ExcelJS.Worksheet, row: number) =>
  (ws.getRow(row).values as unknown[]).slice(1).map((v) => (v instanceof Date ? v.toISOString() : String(v ?? '')));

async function roundTrip(wb: ExcelJS.Workbook) {
  const again = new ExcelJS.Workbook();
  await again.xlsx.load(await wb.xlsx.writeBuffer());
  return again;
}

const HEADER = 3; // row 1 title, row 2 count and export time, row 3 column names

describe('designed Excel export', () => {
  it('has a summary and three sorted lists, every label in the chosen language', async () => {
    const ar = await buildExport(DATA, 'ar', { now: NOW });
    const en = await buildExport(DATA, 'en', { now: NOW });
    expect(ar.worksheets.map((w) => w.name)).toEqual(['الملخص', 'الضيوف', 'الباحثون', 'الحضور اليومي']);
    expect(en.worksheets.map((w) => w.name)).toEqual(['Summary', 'Guests', 'Researchers', 'Check-ins']);
    for (const ws of en.worksheets.slice(1)) expect(text(ws, HEADER).filter((h) => h !== '#').every((h) => !/[؀-ۿ]/.test(h))).toBe(true);
    for (const ws of ar.worksheets.slice(1)) expect(text(ws, HEADER).filter((h) => h !== '#').every((h) => /[؀-ۿ]/.test(h))).toBe(true);
  });

  it('designs each list: navy header, frozen header, filters, sized columns, right-to-left for Arabic, landscape print', async () => {
    const wb = await buildExport(DATA, 'ar', { now: NOW });
    const ws = wb.getWorksheet('الضيوف')!;
    const h = ws.getRow(HEADER).getCell(1);
    expect((h.fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF14234B');
    expect(h.font?.bold).toBe(true);
    expect(h.font?.color?.argb).toBe('FFFFFFFF');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: HEADER, rightToLeft: true });
    expect(ws.autoFilter).toBeTruthy();
    expect(ws.columns.every((c) => (c.width ?? 0) >= 6)).toBe(true);
    expect(ws.pageSetup.orientation).toBe('landscape');
    expect((await buildExport(DATA, 'en', { now: NOW })).getWorksheet('Guests')!.views[0].rightToLeft).toBe(false);
  });

  it('guests: sorted by name, numbered, names as typed, translated values, days present, real dates', async () => {
    const wb = await buildExport(DATA, 'ar', { now: NOW });
    const ws = wb.getWorksheet('الضيوف')!;
    const header = text(ws, HEADER);
    const col = (name: string) => header.indexOf(name) + 1;
    const names = [4, 5, 6].map((r) => ws.getRow(r).getCell(col('الاسم')).value);
    expect(names).toEqual([...names].sort((a, b) => String(a).localeCompare(String(b), 'ar')));
    expect(names).toContain('Ali Hasan Kareem');
    expect([4, 5, 6].map((r) => ws.getRow(r).getCell(1).value)).toEqual([1, 2, 3]);
    const ali = [4, 5, 6].find((r) => ws.getRow(r).getCell(col('الاسم')).value === 'Ali Hasan Kareem')!;
    expect(ws.getRow(ali).getCell(col('الجنس')).value).toBe('ذكر');
    expect(ws.getRow(ali).getCell(col('كبار الضيوف')).value).toBe('نعم');
    expect(ws.getRow(ali).getCell(col('أيام الحضور')).value).toBe(2);
    const at = ws.getRow(ali).getCell(col('وقت التسجيل'));
    expect(at.value).toBeInstanceOf(Date);
    expect((at.value as Date).toISOString()).toBe('2026-11-21T10:00:00.000Z'); // shown as Baghdad time (UTC+3)
    expect(at.numFmt).toMatch(/yyyy/);
    expect(ws.getRow(ali).getCell(col('الهاتف')).value).toBe('+9647701234567'); // kept as text
    expect(ws.getRow(ali).getCell(col('المحافظة')).value).toBe('البصرة');
    const others = [4, 5, 6].filter((r) => r !== ali).map((r) => ws.getRow(r).getCell(col('المحافظة')).value);
    expect(others).toEqual(['—', '—']); // registered before the governorate was asked
    const en = (await buildExport(DATA, 'en', { now: NOW })).getWorksheet('Guests')!;
    const enCol = text(en, HEADER).indexOf('Governorate') + 1;
    expect([4, 5, 6].map((r) => en.getRow(r).getCell(enCol).value)).toContain('Basra');
  });

  it('researchers: sorted, signed first-hand info, and the signature as a picture inside its cell', async () => {
    const signature = vi.fn(async () => PNG);
    const wb = await buildExport(DATA, 'en', { now: NOW, signature });
    const ws = wb.getWorksheet('Researchers')!;
    const header = text(ws, HEADER);
    const col = (name: string) => header.indexOf(name) + 1;
    expect(ws.getRow(4).getCell(col('Name')).value).toBe('Ahmed Ali Hasan');
    expect(ws.getRow(5).getCell(col('Name')).value).toBe('سارة محمود علي');
    expect(ws.getRow(4).getCell(col('Signed')).value).toBe('Yes');
    expect(ws.getRow(5).getCell(col('Signed')).value).toBe('No');
    expect(signature).toHaveBeenCalledWith('signatures/e/r2/1.png');
    expect(signature).toHaveBeenCalledTimes(1);
    const images = ws.getImages();
    expect(images).toHaveLength(1);
    expect(images[0].range.tl.nativeRow).toBe(3); // 0-based row 3 = the 4th row (Ahmed)
    expect(images[0].range.tl.nativeCol).toBe(col('Signature') - 1);
    expect(ws.getRow(4).height).toBeGreaterThanOrEqual(40);
  });

  it('a signature that cannot be fetched does not stop the export', async () => {
    const wb = await buildExport(DATA, 'en', { now: NOW, signature: async () => { throw new Error('offline'); } });
    const ws = wb.getWorksheet('Researchers')!;
    expect(ws.getImages()).toHaveLength(0);
    const col = text(ws, HEADER).indexOf('Signature') + 1;
    expect(String(ws.getRow(4).getCell(col).value)).toMatch(/not available/i);
  });

  it('summary: totals, male/female, VIP, researchers signed, present per day', async () => {
    const wb = await buildExport(DATA, 'en', { now: NOW });
    const rows = wb.getWorksheet('Summary')!.getSheetValues().map((r) => (Array.isArray(r) ? r.slice(1).join(' | ') : ''));
    const all = rows.join('\n');
    expect(all).toMatch(/Registered \| 3/);
    expect(all).toMatch(/Male \| 2/);
    expect(all).toMatch(/Female \| 1/);
    expect(all).toMatch(/VIP guests \| 1/);
    expect(rows).toContain('Researchers | 2');
    expect(rows).toContain('Researchers signed | 1'); // a plain number ("3 of 4" mixes up in right-to-left Excel)
    expect(all).toMatch(/2026-11-21 \| 1/);
    expect(all).toMatch(/2026-11-22 \| 2/);
  });

  it('check-ins sorted by day, then time; and the file opens again as a real Excel workbook', async () => {
    const wb = await roundTrip(await buildExport(DATA, 'en', { now: NOW, signature: async () => PNG }));
    const ws = wb.getWorksheet('Check-ins')!;
    const header = text(ws, HEADER);
    const day = header.indexOf('Day') + 1;
    const name = header.indexOf('Name') + 1;
    expect([4, 5, 6].map((r) => ws.getRow(r).getCell(day).value)).toEqual(['2026-11-21', '2026-11-22', '2026-11-22']);
    expect(ws.getRow(5).getCell(name).value).toBe('Ali Hasan Kareem'); // 06:00 before 06:30
    expect(wb.getWorksheet('Researchers')!.getImages()).toHaveLength(1);
  });

  it('every column keeps its width after saving, short values are centred, text lines up with the language', async () => {
    const wb = await roundTrip(await buildExport(DATA, 'ar', { now: NOW }));
    const ws = wb.getWorksheet('الضيوف')!;
    const header = text(ws, HEADER);
    const col = (name: string) => header.indexOf(name) + 1;
    for (const name of ['الجنس', 'كبار الضيوف', 'أيام الحضور', 'لغة التسجيل']) {
      expect(ws.getColumn(col(name)).width ?? 0, name).toBeGreaterThanOrEqual(11); // the header fits
    }
    for (const name of ['الرقم المرجعي', 'الهاتف', 'الجنس', 'كبار الضيوف', 'أيام الحضور', 'وقت التسجيل']) {
      expect(ws.getRow(4).getCell(col(name)).alignment?.horizontal, name).toBe('center');
    }
    for (const name of ['الاسم', 'البريد الإلكتروني', 'جهة العمل']) {
      expect(ws.getRow(4).getCell(col(name)).alignment?.horizontal, name).toBe('right'); // English text too
    }
    const en = (await buildExport(DATA, 'en', { now: NOW })).getWorksheet('Guests')!;
    expect(en.getRow(4).getCell(2).alignment?.horizontal).toBe('left');
  });

  it('file name carries language and time', () => {
    expect(exportFileName('en', new Date(2026, 10, 21, 9, 5))).toBe('alfarabi-conf-2026-en-20261121-0905.xlsx');
  });
});
