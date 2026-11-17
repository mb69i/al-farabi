// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildValues, certificateDatePhrase, CertificateError, fillTemplate, REQUIRED_PLACEHOLDERS } from './values.ts';

const base = {
  name: 'د. أحمد علي حسين',
  org: 'جامعة بغداد',
  role: 'attendee' as const,
  dateFrom: '2026-11-21',
  dateTo: '2026-11-22',
  serial: 'ALF26-7KQ2-M9XA-C4RT',
  verifyBase: 'https://al-farabi-gilt.vercel.app',
  variant: 'plain' as const,
};

describe('certificate date phrase (Iraqi months)', () => {
  it('one day', () => {
    expect(certificateDatePhrase('2026-11-02', '2026-11-02')).toBe('بتاريخ 2 تشرين الثاني 2026');
  });
  it('several days in one month', () => {
    expect(certificateDatePhrase('2026-09-22', '2026-09-23')).toBe('للفترة من 22 – 23 أيلول 2026');
  });
  it('across months', () => {
    expect(certificateDatePhrase('2026-09-30', '2026-10-01')).toBe('للفترة من 30 أيلول – 1 تشرين الأول 2026');
  });
  it('refuses a broken or backwards date', () => {
    expect(() => certificateDatePhrase('2026-13-01', '2026-13-01')).toThrow(CertificateError);
    expect(() => certificateDatePhrase('2026-11-22', '2026-11-21')).toThrow(/date/);
  });
});

describe('buildValues', () => {
  it('fills every placeholder and points the QR at the verify page', () => {
    const v = buildValues(base);
    expect(v.url).toBe('https://al-farabi-gilt.vercel.app/verify?s=ALF26-7KQ2-M9XA-C4RT');
    expect(v.fields.NAME).toBe('د. أحمد علي حسين');
    expect(v.fields.ORG_LINE).toBe('(جامعة بغداد)');
    expect(v.fields.DATE_PHRASE).toBe('للفترة من 21 – 22 تشرين الثاني 2026');
    expect(v.fields.SERIAL).toBe('ALF26-7KQ2-M9XA-C4RT');
    expect(v.fields.VARIANT).toBe('plain');
    expect(v.fields.STATEMENT).toContain('للمشاركة');
  });

  it('a trailing slash on the site address does not double up', () => {
    expect(buildValues({ ...base, verifyBase: 'https://example.org/' }).url).toBe('https://example.org/verify?s=ALF26-7KQ2-M9XA-C4RT');
  });

  it('researchers get the research wording', () => {
    expect(buildValues({ ...base, role: 'researcher' }).fields.STATEMENT).toContain('ببحث');
    expect(buildValues(base).fields.STATEMENT).not.toContain('ببحث');
  });

  it('no organisation means no brackets line; extra spaces and brackets are tidied', () => {
    expect(buildValues({ ...base, org: '  ' }).fields.ORG_LINE).toBe('');
    expect(buildValues({ ...base, org: null }).fields.ORG_LINE).toBe('');
    expect(buildValues({ ...base, org: ' (كلية   الطب) ' }).fields.ORG_LINE).toBe('(كلية الطب)');
  });

  it('escapes names so they cannot inject markup', () => {
    expect(buildValues({ ...base, name: 'Ali <b>x</b> & "y"' }).fields.NAME).toBe('Ali &lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;');
  });

  it('hard-fails on a missing name, date, URL or serial', () => {
    expect(() => buildValues({ ...base, name: '   ' })).toThrow(/name/);
    expect(() => buildValues({ ...base, name: undefined as unknown as string })).toThrow(/name/);
    expect(() => buildValues({ ...base, dateFrom: '' })).toThrow(/date/);
    expect(() => buildValues({ ...base, dateTo: undefined as unknown as string })).toThrow(/date/);
    expect(() => buildValues({ ...base, verifyBase: '' })).toThrow(/URL/);
    expect(() => buildValues({ ...base, verifyBase: 'javascript:alert(1)' })).toThrow(/URL/);
    expect(() => buildValues({ ...base, serial: 'ALF26-0000' })).toThrow(/serial/);
  });

  it('only the two known variants', () => {
    expect(buildValues({ ...base, variant: 'sponsors' }).fields.VARIANT).toBe('sponsors');
    expect(() => buildValues({ ...base, variant: 'gold' as 'plain' })).toThrow(/variant/);
  });
});

describe('fillTemplate', () => {
  const template = readFileSync(new URL('./template.html', import.meta.url), 'utf8');

  it('the template has every placeholder the engine fills', () => {
    for (const key of REQUIRED_PLACEHOLDERS) expect(template).toContain(`{{${key}}}`);
  });

  it('replaces all placeholders, the QR as raw SVG', () => {
    const v = buildValues(base);
    const html = fillTemplate(template, { ...v.fields, QR: '<svg id="qr"></svg>', SPONSORS: '' });
    expect(html).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(html).toContain('<svg id="qr"></svg>');
    expect(html).toContain('د. أحمد علي حسين');
  });

  it('refuses to leave a placeholder empty-handed', () => {
    expect(() => fillTemplate('<p>{{NAME}} {{MISSING}}</p>', { NAME: 'x' })).toThrow(/MISSING/);
  });
});
