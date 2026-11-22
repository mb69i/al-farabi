import { describe, expect, it } from 'vitest';
import { conferenceDay } from './conferenceDay';

describe('conferenceDay (Baghdad time)', () => {
  it('counts from the first day', () => {
    expect(conferenceDay('2026-11-21', Date.parse('2026-11-21T08:00:00Z'))).toBe(1);
    expect(conferenceDay('2026-11-21', Date.parse('2026-11-22T06:00:00Z'))).toBe(2);
  });
  it('uses the Baghdad date, not UTC (01:00 in Baghdad is already the next day)', () => {
    expect(conferenceDay('2026-11-21', Date.parse('2026-11-21T22:00:00Z'))).toBe(2);
  });
  it('is null without a start date or before the conference', () => {
    expect(conferenceDay(undefined, Date.now())).toBeNull();
    expect(conferenceDay('2026-11-21', Date.parse('2026-11-20T08:00:00Z'))).toBeNull();
  });
});
