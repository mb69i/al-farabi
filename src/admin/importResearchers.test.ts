import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { parseResearcherSheet } from './importResearchers';

function book(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('parseResearcherSheet', () => {
  it('parses Arabic headers', () => {
    const { rows, errors } = parseResearcherSheet(
      book([
        ['الاسم', 'الاسم بالانكليزي', 'البريد', 'الهاتف', 'الجنس', 'الجهة', 'عنوان البحث'],
        ['أحمد علي', 'Ahmed Ali', 'Ahmed@Uni.edu', '0770 123 4567', 'ذكر', 'جامعة بغداد', 'الذكاء الاصطناعي في الطب'],
      ]),
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        name_ar: 'أحمد علي',
        name_en: 'Ahmed Ali',
        email: 'ahmed@uni.edu',
        phone: '+9647701234567',
        gender: 'male',
        institution: 'جامعة بغداد',
        research_title: 'الذكاء الاصطناعي في الطب',
      },
    ]);
  });

  it('matches header spelling variants (hamza, spaces, English names)', () => {
    const { rows } = parseResearcherSheet(
      book([
        [' Name_AR ', 'English Name', 'E-mail', 'Gender', 'Institution', 'Research Title'],
        ['سارة', 'Sara', 's@x.org', 'Female', 'UoB', 'T'],
      ]),
    );
    expect(rows[0]).toMatchObject({ name_ar: 'سارة', name_en: 'Sara', email: 's@x.org', gender: 'female' });
  });

  it('reports row with bad email and keeps others', () => {
    const { rows, errors } = parseResearcherSheet(
      book([
        ['name_ar', 'email', 'research_title'],
        ['أ', 'bad-email', 'T1'],
        ['ب', 'b@x.org', 'T2'],
      ]),
    );
    expect(rows.map((r) => r.email)).toEqual(['b@x.org']);
    expect(errors).toEqual([{ row: 2, message: 'email' }]);
  });

  it('accepts empty name_en', () => {
    const { rows, errors } = parseResearcherSheet(book([['name_ar', 'name_en', 'email', 'research_title'], ['علي', '', 'a@x.org', 'T']]));
    expect(errors).toEqual([]);
    expect(rows[0].name_en).toBeNull();
  });

  it('uses the English name when the Arabic one is missing', () => {
    const { rows } = parseResearcherSheet(book([['name_ar', 'name_en', 'email', 'research_title'], ['', 'John Smith', 'j@x.org', 'T']]));
    expect(rows[0]).toMatchObject({ name_ar: 'John Smith', name_en: 'John Smith' });
  });

  it('requires a research title and some name', () => {
    const { errors } = parseResearcherSheet(
      book([
        ['name_ar', 'email', 'research_title'],
        ['علي', 'a@x.org', ''],
        ['', 'b@x.org', 'T'],
      ]),
    );
    expect(errors).toEqual([
      { row: 2, message: 'research_title' },
      { row: 3, message: 'name' },
    ]);
  });

  it('keeps a researcher whose optional phone is invalid, with a warning', () => {
    const { rows, errors, warnings } = parseResearcherSheet(book([['name_ar', 'email', 'phone', 'research_title'], ['علي', 'a@x.org', '123', 'T']]));
    expect(errors).toEqual([]);
    expect(rows[0].phone).toBeNull();
    expect(warnings).toEqual([{ row: 2, message: 'phone' }]);
  });

  it('reads foreign numbers that Excel stored as plain numbers', () => {
    const { rows, warnings } = parseResearcherSheet(
      book([['name_ar', 'email', 'phone', 'research_title'], ['علي رضا', 'ar@x.ir', 989123456789, 'T'], ['سامي', 's@x.lb', 9613123456, 'T2']]),
    );
    expect(rows.map((r) => r.phone)).toEqual(['+989123456789', '+9613123456']);
    expect(warnings).toEqual([]);
  });

  it('skips fully empty rows', () => {
    const { rows, errors } = parseResearcherSheet(book([['name_ar', 'email', 'research_title'], [], ['علي', 'a@x.org', 'T']]));
    expect(rows).toHaveLength(1);
    expect(errors).toEqual([]);
  });
});
