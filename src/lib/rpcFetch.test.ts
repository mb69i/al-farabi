import { describe, expect, it, vi } from 'vitest';
import { createFetchRpc } from './rpcFetch';

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async () =>
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('createFetchRpc (small public RPC client, no supabase-js)', () => {
  it('posts the args as JSON to /rest/v1/rpc/<fn> with the public key headers', async () => {
    const f = fakeFetch(200, { ok: 1 });
    const rpc = createFetchRpc('https://x.supabase.co/', 'anon-key', f);
    const res = await rpc.rpc('get_public_event', { p_slug: 'a' });
    expect(res).toEqual({ data: { ok: 1 }, error: null, status: 200 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/rest/v1/rpc/get_public_event');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ p_slug: 'a' });
    const h = new Headers(init.headers);
    expect(h.get('apikey')).toBe('anon-key');
    expect(h.get('Authorization')).toBe('Bearer anon-key');
    expect(h.get('Content-Type')).toBe('application/json');
  });

  it('returns data null on an empty 204 reply', async () => {
    const rpc = createFetchRpc('https://x.supabase.co', 'k', fakeFetch(204, undefined));
    expect(await rpc.rpc('f')).toEqual({ data: null, error: null, status: 204 });
  });

  it('returns the PostgREST message as the error on a 4xx/5xx', async () => {
    const rpc = createFetchRpc('https://x.supabase.co', 'k', fakeFetch(400, { message: 'bad input', code: 'P0001' }));
    expect(await rpc.rpc('f', {})).toEqual({ data: null, error: { message: 'bad input' }, status: 400 });
  });

  it('reports a network failure as status 0 so the caller retries', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const rpc = createFetchRpc('https://x.supabase.co', 'k', f);
    expect(await rpc.rpc('f')).toEqual({ data: null, error: { message: 'Failed to fetch' }, status: 0 });
  });
});
