import { createApi, type Api } from './api';
import { EVENT_SLUG, hasBackend, SUPABASE_ANON_KEY, SUPABASE_URL } from './config';
import { demoApi } from './demoApi';
import { createFetchRpc } from './rpcFetch';

export const api: Api = hasBackend
  ? createApi(createFetchRpc(SUPABASE_URL!, SUPABASE_ANON_KEY!), EVENT_SLUG)
  : import.meta.env.DEV
    ? demoApi
    : createApi({ rpc: async () => ({ data: null, error: { message: 'not configured' }, status: 500 }) }, EVENT_SLUG);
