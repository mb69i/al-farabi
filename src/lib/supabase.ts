import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const EVENT_SLUG = (import.meta.env.VITE_EVENT_SLUG as string | undefined) || 'alfarabi-conf-2026';
export const hasBackend = Boolean(url && anon);

export const supabase: SupabaseClient | null = hasBackend
  ? createClient(url!, anon!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
