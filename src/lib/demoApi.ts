import type { Api } from './api';

/** Local development only (no Supabase keys): lets the screens be seen without a backend. */
export const demoApi: Api = {
  getPublicEvent: async () => ({ registration_open: true }),
  registerGuest: async () => {
    await new Promise((r) => setTimeout(r, 700));
    return { status: 'created', serial: 'ALF26-DEMO42', checked_in_today: true };
  },
  checkinGuest: async () => ({ status: 'ok', checked_in_today: true }),
  getSiteContact: async () => ({ phone: '07700000000', email: 'info@example.org', location_ar: 'جامعة الفارابي — بغداد', location_en: 'Al-Farabi University — Baghdad' }),
  getDisplayCounts: async () => ({
    total: 412, present_today: 287, male: 198, female: 176, vip: 23, researchers_signed: 64, researchers_total: 121,
  }),
};
