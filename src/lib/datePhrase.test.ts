import { describe, expect, it } from 'vitest';
import { datePhrase } from './datePhrase';

describe('datePhrase (Iraqi month names in Arabic)', () => {
  it('one day', () => {
    expect(datePhrase('2026-11-21', '2026-11-21', 'ar')).toBe('21 تشرين الثاني 2026');
    expect(datePhrase('2026-11-21', '2026-11-21', 'en')).toBe('21 November 2026');
  });
  it('several days in one month', () => {
    expect(datePhrase('2026-11-21', '2026-11-22', 'ar')).toBe('21 – 22 تشرين الثاني 2026');
    expect(datePhrase('2026-11-21', '2026-11-22', 'en')).toBe('21–22 November 2026');
  });
  it('across months and years', () => {
    expect(datePhrase('2026-11-30', '2026-12-01', 'ar')).toBe('30 تشرين الثاني – 1 كانون الأول 2026');
    expect(datePhrase('2026-12-31', '2027-01-01', 'en')).toBe('31 December 2026 – 1 January 2027');
  });
  it('covers every Iraqi month name', () => {
    const names = Array.from({ length: 12 }, (_, i) => datePhrase(`2026-${String(i + 1).padStart(2, '0')}-05`, `2026-${String(i + 1).padStart(2, '0')}-05`, 'ar').slice(2, -5));
    expect(names).toEqual(['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول']);
  });
});
