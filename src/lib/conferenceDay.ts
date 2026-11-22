/** Which day of the conference it is in Baghdad (UTC+3, no daylight saving): 1, 2, … or null before it starts. */
export function conferenceDay(startsOn: string | undefined, now: number): number | null {
  if (!startsOn) return null;
  const start = Date.parse(`${startsOn}T00:00:00Z`);
  if (Number.isNaN(start)) return null;
  const baghdad = new Date(now + 3 * 3600_000);
  const today = Date.UTC(baghdad.getUTCFullYear(), baghdad.getUTCMonth(), baghdad.getUTCDate());
  const day = Math.round((today - start) / 86_400_000) + 1;
  return day >= 1 ? day : null;
}
