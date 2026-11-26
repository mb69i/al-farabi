// Build-time settings, kept apart from supabase-js so public pages don't load it.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const EVENT_SLUG = (import.meta.env.VITE_EVENT_SLUG as string | undefined) || 'tedxbaghdad-2026';
/** First conference day, used for the day-two welcome when the event lookup has not answered. */
export const EVENT_STARTS_ON = (import.meta.env.VITE_EVENT_STARTS_ON as string | undefined) || '2026-12-19'; // placeholder until the training date is set (owner, 26 Nov)
export const hasBackend = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
