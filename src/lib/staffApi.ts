import type { DeskRow } from './deskSearch';
import type { SupabaseClient } from '@supabase/supabase-js';
import { submitSignoff, type SignoffResult } from './signoff';

export type ResearcherRow = {
  id: string;
  name_ar: string;
  name_en: string | null;
  institution: string | null;
  research_title: string;
  signed: boolean;
  /** ARCDT26-007 style paper ID and the session hall (L_102, OL1) from the agenda; null for papers not on it. */
  paper_code: string | null;
  hall: string | null;
};

/** Staff (doctor) calls. All authorisation is enforced by the database. */
export function createStaffApi(client: SupabaseClient, slug: string) {
  let eventId: string | null = null;

  async function getEventId(): Promise<string> {
    if (eventId) return eventId;
    const { data, error } = await client.rpc('get_public_event', { p_slug: slug });
    if (error || !data?.id) throw new Error(error?.message ?? 'event not found');
    eventId = data.id as string;
    return eventId;
  }

  return {
    async searchResearchers(q: string): Promise<ResearcherRow[]> {
      getEventId().catch(() => {}); // look the event up now so the first signature does not wait for it
      const { data, error } = await client.rpc('search_researchers', { p_slug: slug, p_query: q });
      if (error) throw new Error(error.message);
      return (data ?? []) as ResearcherRow[];
    },

    async deskResearchers(): Promise<DeskRow[]> {
      const { data, error } = await client.rpc('desk_researchers', { p_slug: slug });
      if (error) throw new Error(error.message);
      return (data ?? []) as DeskRow[];
    },

    async signOff(r: ResearcherRow, png: Blob, strokes: unknown): Promise<SignoffResult> {
      return submitSignoff(
        {
          upload: async (path, body, contentType) => {
            const { error } = await client.storage.from('signatures').upload(path, body, { contentType, upsert: false });
            return { error: error ? { message: error.message, statusCode: (error as { statusCode?: string }).statusCode } : null };
          },
          rpc: async (fn, args) => {
            const { data, error } = await client.rpc(fn, args);
            return { data, error: error ? { message: error.message } : null };
          },
        },
        { eventId: await getEventId(), researcherId: r.id, png, strokes, device: navigator.userAgent },
      );
    },
  };
}
