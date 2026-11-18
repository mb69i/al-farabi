/**
 * Sponsors for the hall screen: a slowly moving bar along the bottom.
 *
 * SPONSOR_BAND is one strip image of the owner's 68 sponsor logos (sent 18 Nov as 14 MB of PNGs), each trimmed,
 * 120 px tall and evenly spaced, so the bar is a single ~450 KB download. The screen shows two copies side by side
 * and slides them for a seamless loop. Remake it with the same spacing if logos change. null = four marked empty
 * slots: never invented sponsors.
 */
export type SponsorBand = { src: string; alt: string };

export const SPONSOR_BAND: SponsorBand | null = {
  src: '/brand/sponsors-strip.webp',
  alt: 'الجهات الراعية والمشاركة — Sponsors & Partners',
};
