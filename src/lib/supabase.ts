import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasBackend, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';

export { EVENT_SLUG, hasBackend } from './config';

/** Full client with sign-in; only the staff screens (loaded on demand) import this. */
export const supabase: SupabaseClient | null = hasBackend
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;
