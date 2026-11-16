import { createApi, type Api, type RpcClient } from './api';
import { demoApi } from './demoApi';
import { EVENT_SLUG, supabase } from './supabase';

export const api: Api = supabase
  ? createApi(supabase as unknown as RpcClient, EVENT_SLUG)
  : import.meta.env.DEV
    ? demoApi
    : createApi({ rpc: async () => ({ data: null, error: { message: 'not configured' }, status: 500 }) }, EVENT_SLUG);
