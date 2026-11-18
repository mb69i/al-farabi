/**
 * Sponsor logos for the hall screen footer (and later the certificate's sponsors variant).
 * Put each logo in public/sponsors/ and list it here, e.g. { name: 'Company', logo: '/sponsors/company.png' }.
 * While the list is empty the footer shows four empty, clearly-marked slots: no invented sponsors.
 */
export type Sponsor = { name: string; logo: string };

export const SPONSORS: Sponsor[] = [];
