import type { RpcClient } from './api';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * A tiny client for public database functions (PostgREST /rest/v1/rpc). The public pages use this
 * instead of supabase-js, which is ~70 KB gzip and only staff screens need.
 */
export function createFetchRpc(url: string, anonKey: string, fetchImpl: FetchLike = (u, i) => fetch(u, i)): RpcClient {
  const base = url.replace(/\/+$/, '');
  return {
    async rpc(fn, args = {}) {
      let res: Response;
      try {
        res = await fetchImpl(`${base}/rest/v1/rpc/${fn}`, {
          method: 'POST',
          headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(args),
        });
      } catch (e) {
        return { data: null, error: { message: e instanceof Error ? e.message : 'network error' }, status: 0 };
      }
      const text = await res.text().catch(() => '');
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      if (!res.ok) {
        const message = (body as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
        return { data: null, error: { message }, status: res.status };
      }
      return { data: body, error: null, status: res.status };
    },
  };
}
