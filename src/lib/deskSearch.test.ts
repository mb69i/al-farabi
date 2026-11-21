import { describe, expect, it } from 'vitest';
import { filterLocal, needsServer, type DeskRow } from './deskSearch';

const row = (id: string, name_ar: string, paper_code: string | null, signed = false): DeskRow => ({
  id, name_ar, name_en: null, institution: null, research_title: 't', signed, paper_code, hall: 'l_102',
  key: `${name_ar.replace('أ', 'ا')} ${paper_code?.toLowerCase() ?? ''} l_102`,
});
const LIST = [row('a', 'أحمد علي', 'ARCDT26-912', true), row('b', 'أحمد حسن', 'ARCDT26-007'), row('c', 'سارة', 'ARCDT26-091')];

describe('desk search on the phone', () => {
  it('finds by name with Arabic letter forms folded, unsigned first', () => {
    expect(filterLocal(LIST, 'أحمد').map((r) => r.id)).toEqual(['b', 'a']);
  });
  it('finds by paper number, the exact paper first', () => {
    expect(filterLocal(LIST, '٩١').map((r) => r.id)).toEqual(['c', 'a']);
    expect(filterLocal(LIST, 'arcdt26-912').map((r) => r.id)).toEqual(['a']);
  });
  it('sends phone numbers and emails to the server', () => {
    expect(needsServer('0770 123')).toBe(true);
    expect(needsServer('+964770')).toBe(true);
    expect(needsServer('a@b')).toBe(true);
    expect(needsServer('912')).toBe(false);
    expect(needsServer('أحمد')).toBe(false);
  });
});
