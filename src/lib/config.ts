// Build-time settings, kept apart from supabase-js so public pages don't load it.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const EVENT_SLUG = (import.meta.env.VITE_EVENT_SLUG as string | undefined) || 'alfarabi-conf-2026';
export const hasBackend = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
