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
  verifyCertificate: async (serial) =>
    serial.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === 'ALF26DEMODEMODEMO'
      ? { status: 'valid', serial: 'ALF26-DEMO-DEMO-DEMO', name: 'محمد الباقر علي', role: 'attendee',
          event_ar: 'مؤتمر الفارابي للبحوث التطبيقية في التحول الرقمي الشامل', event_en: 'Al-Farabi Conference on Applied Research in Comprehensive Digital Transformation',
          date_from: '2026-11-21', date_to: '2026-11-22' }
      : { status: 'not_found' },
  getDisplayCounts: async () => ({
    total: 412, present_today: 287, male: 198, female: 176, vip: 23, researchers_signed: 64, researchers_total: 121,
  }),
};
