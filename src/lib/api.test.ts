import { describe, expect, it, vi } from 'vitest';
import { createApi, type RpcClient } from './api';

function client(responses: Array<{ data?: unknown; error?: { message: string } | null; status: number } | Error>) {
  const rpc = vi.fn(async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return { data: next?.data ?? null, error: next?.error ?? null, status: next?.status ?? 200 };
  });
  return { rpc } as unknown as RpcClient & { rpc: typeof rpc };
}

const input = {
  fullName: '  محمد علي  ',
  phone: '0770 123 4567',
  email: ' Ali@Gmail.com ',
  gender: 'male' as const,
  workplace: 'جامعة بغداد',
  specialization: 'هندسة',
  lang: 'ar' as const,
};

describe('registerGuest', () => {
  it('sends normalised values to register_guest', async () => {
    const c = client([{ data: { status: 'created', serial: 'ALF26-ABC234', checked_in_today: true }, status: 200 }]);
    const res = await createApi(c, 'slug', { sleep: async () => {} }).registerGuest(input);
    expect(res.status).toBe('created');
    expect(c.rpc).toHaveBeenCalledWith('register_guest', {
      p_slug: 'slug',
      p_full_name: 'محمد علي',
      p_phone: '+9647701234567',
      p_email: 'ali@gmail.com',
      p_gender: 'male',
      p_guest_type: null,
      p_workplace: 'جامعة بغداد',
      p_specialization: 'هندسة',
      p_lang: 'ar',
      p_governorate: null,
    });
    await createApi(c, 'slug', { sleep: async () => {} }).registerGuest({ ...input, governorate: 'najaf' });
    expect(c.rpc).toHaveBeenLastCalledWith('register_guest', expect.objectContaining({ p_governorate: 'najaf' }));
  });

  it('retries network errors and 5xx, then succeeds', async () => {
    const c = client([
      new TypeError('Failed to fetch'),
      { error: { message: 'busy' }, status: 503 },
      { data: { status: 'created', serial: 'S', checked_in_today: true }, status: 200 },
    ]);
    const res = await createApi(c, 'slug', { sleep: async () => {} }).registerGuest(input);
    expect(res.serial).toBe('S');
    expect(c.rpc).toHaveBeenCalledTimes(3);
  });

  it('never retries a 4xx', async () => {
    const c = client([{ error: { message: 'bad' }, status: 400 }]);
    await expect(createApi(c, 'slug', { sleep: async () => {} }).registerGuest(input)).rejects.toThrow();
    expect(c.rpc).toHaveBeenCalledTimes(1);
  });

  it('gives up after 3 attempts', async () => {
    const c = client([new TypeError('x'), new TypeError('x'), new TypeError('x'), new TypeError('x')]);
    await expect(createApi(c, 'slug', { sleep: async () => {} }).registerGuest(input)).rejects.toThrow();
    expect(c.rpc).toHaveBeenCalledTimes(3);
  });
});

describe('verifyCertificate', () => {
  it('calls verify_certificate with the serial and returns its answer', async () => {
    const c = client([{ data: { status: 'not_found' }, status: 200 }]);
    const res = await createApi(c, 'slug', { sleep: async () => {} }).verifyCertificate('ALF26-ABCD-EFGH-JKLM');
    expect(res).toEqual({ status: 'not_found' });
    expect(c.rpc).toHaveBeenCalledWith('verify_certificate', { p_serial: 'ALF26-ABCD-EFGH-JKLM' });
  });
});
