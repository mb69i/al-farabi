/**
 * Sponsors for the hall screen footer.
 *
 * SPONSOR_BAND is the "Sponsors & Partners · الجهات الراعية والمشاركة" band (two rows, about 70 logos)
 * cut at 300 dpi from the owner's sponsors certificate (certs/forma/forma-sponsors.pdf, sent 18 Nov),
 * so the screen shows exactly the designer's sponsors. Set it to null to fall back to four empty,
 * clearly-marked slots: never invented sponsors.
 */
export type SponsorBand = { src: string; alt: string };

export const SPONSOR_BAND: SponsorBand | null = {
  src: '/brand/sponsors-band.webp',
  alt: 'الجهات الراعية والمشاركة — Sponsors & Partners',
};
