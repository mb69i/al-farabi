import { describe, expect, it } from 'vitest';
import {
  nameScript,
  normalizeArabicForSearch,
  normalizeEmail,
  normalizePhone,
  suggestEmailFix,
} from './normalize';

describe('normalizePhone', () => {
  it('converts Iraqi local numbers with spaces', () => {
    expect(normalizePhone('0770 123 4567')).toBe('+9647701234567');
  });
  it('converts Arabic-Indic digits', () => {
    expect(normalizePhone('٠٧٧٠١٢٣٤٥٦٧')).toBe('+9647701234567');
  });
  it('converts Persian digits', () => {
    expect(normalizePhone('۰۷۷۰۱۲۳۴۵۶۷')).toBe('+9647701234567');
  });
  it('converts 00 international prefix', () => {
    expect(normalizePhone('009647701234567')).toBe('+9647701234567');
  });
  it('keeps foreign E.164 numbers (Iran, Australia, Lebanon, Algeria, Nigeria)', () => {
    expect(normalizePhone('+98 912 345 6789')).toBe('+989123456789');
    expect(normalizePhone('+61 412 345 678')).toBe('+61412345678');
    expect(normalizePhone('+961 3 123 456')).toBe('+9613123456');
    expect(normalizePhone('+213 551 23 45 67')).toBe('+213551234567');
    expect(normalizePhone('+234 803 123 4567')).toBe('+2348031234567');
  });
  it('rejects too short numbers', () => {
    expect(normalizePhone('12345')).toBeNull();
  });
  it('rejects Iraqi local numbers with the wrong length', () => {
    expect(normalizePhone('07701234')).toBeNull();
  });
  it('rejects empty input', () => {
    expect(normalizePhone('')).toBeNull();
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Ali@Gmail.COM ')).toBe('ali@gmail.com');
  });
  it('rejects incomplete addresses', () => {
    expect(normalizeEmail('ali@')).toBeNull();
    expect(normalizeEmail('ali@gmail')).toBeNull();
    expect(normalizeEmail('a li@gmail.com')).toBeNull();
  });
});

describe('suggestEmailFix', () => {
  it('fixes common domain typos', () => {
    expect(suggestEmailFix('ali@gmial.com')).toBe('ali@gmail.com');
    expect(suggestEmailFix('ali@gmail.co')).toBe('ali@gmail.com');
    expect(suggestEmailFix('ali@hotmial.com')).toBe('ali@hotmail.com');
    expect(suggestEmailFix('ali@yahooo.com')).toBe('ali@yahoo.com');
    expect(suggestEmailFix('ali@outlok.com')).toBe('ali@outlook.com');
  });
  it('returns null for correct domains', () => {
    expect(suggestEmailFix('ali@gmail.com')).toBeNull();
    expect(suggestEmailFix('ali@alfarabiuc.edu.iq')).toBeNull();
  });
});

describe('nameScript', () => {
  it('detects Arabic', () => expect(nameScript('محمد الباقر')).toBe('ar'));
  it('detects English', () => expect(nameScript('Mohammed Albaqir')).toBe('en'));
  it('detects mixed', () => expect(nameScript('محمد Ali')).toBe('mixed'));
});

describe('normalizeArabicForSearch', () => {
  it('ignores hamza forms, diacritics and extra spaces', () => {
    expect(normalizeArabicForSearch('أحْمَد  إبراهيم')).toBe(normalizeArabicForSearch('احمد ابراهيم'));
  });
  it('treats ta marbuta as ha', () => {
    expect(normalizeArabicForSearch('فاطمة')).toBe(normalizeArabicForSearch('فاطمه'));
  });
  it('treats alef maqsura as ya', () => {
    expect(normalizeArabicForSearch('مصطفى')).toBe(normalizeArabicForSearch('مصطفي'));
  });
  it('removes tatweel', () => {
    expect(normalizeArabicForSearch('محـــمد')).toBe('محمد');
  });
  it('lowercases English and collapses spaces', () => {
    expect(normalizeArabicForSearch('Ali  HASAN')).toBe('ali hasan');
  });
});
