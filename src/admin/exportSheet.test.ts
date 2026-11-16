import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import type { AdminExport } from './adminApi';
import { buildExport, exportFileName } from './exportSheet';

const DATA: AdminExport = {
  guests: [
    {
      id: 'g1', serial: 'ALF26-AAA222', full_name: 'Ali Hasan', phone: '+9647701234567', email: 'a@x.org',
      gender: 'male', guest_type: 'student', workplace: 'UoB', specialization: 'CS', lang: 'en', is_vip: true,
      created_at: '2026-11-21T07:00:00Z',
    },
    {
      id: 'g2', serial: 'ALF26-BBB333', full_name: 'زينب كاظم', phone: '+9647801234567', email: 'z@x.org',
      gender: 'female', guest_type: 'visitor', workplace: 'جامعة بغداد', specialization: 'طب', lang: 'ar', is_vip: false,
      created_at: '2026-11-21T07:05:00Z',
    },
  ],
  researchers: [
    {
      id: 'r1', name_ar: 'أحمد علي', name_en: 'Ahmed Ali', email: 'ah@x.org', phone: null, gender: 'male',
      institution: 'UoB', research_title: 'T1', is_vip: false, signed_at: '2026-11-21T09:00:00Z', doctor_name: 'Dr S', signature_path: 'p',
    },
    {
      id: 'r2', name_ar: 'سارة محمود', name_en: null, email: 's@x.org', phone: null, gender: null,
      institution: null, research_title: 'T2', is_vip: false, signed_at: null, doctor_name: null, signature_path: null,
    },
  ],
  checkins: [{ serial: 'ALF26-AAA222', full_name: 'Ali Hasan', day: '2026-11-21', at: '2026-11-21T07:00:00Z' }],
};

function sheet(wb: XLSX.WorkBook, i: number): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[i]], { header: 1, defval: '' });
}

const ARABIC = /[؀-ۿ]/;

describe('buildExport', () => {
  it('export en uses name_en with fallback to name_ar', () => {
    const rows = sheet(buildExport(DATA, 'en'), 1);
    expect(rows[1][0]).toBe('Ahmed Ali');
    expect(rows[2][0]).toBe('سارة محمود');
  });

  it('export ar uses the Arabic researcher names', () => {
    const rows = sheet(buildExport(DATA, 'ar'), 1);
    expect(rows[1][0]).toBe('أحمد علي');
  });

  it('export ar translates gender and type values', () => {
    const rows = sheet(buildExport(DATA, 'ar'), 0);
    const header = rows[0] as string[];
    const g = rows[1];
    expect(g[header.indexOf('الجنس')]).toBe('ذكر');
    expect(g[header.indexOf('صفة الحضور')]).toBe('طالب');
    expect(g[header.indexOf('كبار الضيوف')]).toBe('نعم');
  });

  it('export keeps guest names as typed', () => {
    for (const lang of ['ar', 'en'] as const) {
      const rows = sheet(buildExport(DATA, lang), 0);
      expect(rows[1][0]).toBe('Ali Hasan');
      expect(rows[2][0]).toBe('زينب كاظم');
    }
  });

  it('export header row fully in chosen language', () => {
    const en = buildExport(DATA, 'en');
    const ar = buildExport(DATA, 'ar');
    for (let i = 0; i < 3; i++) {
      expect((sheet(en, i)[0] as string[]).every((h) => !ARABIC.test(h))).toBe(true);
      expect((sheet(ar, i)[0] as string[]).every((h) => ARABIC.test(h))).toBe(true);
    }
    expect(en.SheetNames).toEqual(['Guests', 'Researchers', 'Check-ins']);
    expect(ar.SheetNames).toEqual(['الضيوف', 'الباحثون', 'الحضور اليومي']);
  });

  it('file name carries language and time', () => {
    expect(exportFileName('en', new Date(2026, 10, 21, 9, 5))).toBe('alfarabi-conf-2026-en-20261121-0905.xlsx');
  });
});
