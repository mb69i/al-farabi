import { describe, expect, it } from 'vitest';
import { once, oneAtATime } from './serial.mjs';

// Load test (20 Nov): several certificates drawn at once inside one server copy raced to unpack Chromium
// ("spawn ETXTBSY") and crashed each other's browser. One unpack per copy, one drawing at a time.
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('one drawing at a time per server copy', () => {
  it('never runs two calls together, and keeps their order', async () => {
    let active = 0, peak = 0;
    const order: number[] = [];
    const draw = oneAtATime(async (n: number) => {
      active++; peak = Math.max(peak, active);
      await tick(15);
      order.push(n);
      active--;
      return n * 2;
    });
    const out = await Promise.all([1, 2, 3, 4].map((n) => draw(n)));
    expect(out).toEqual([2, 4, 6, 8]);
    expect(peak).toBe(1);
    expect(order).toEqual([1, 2, 3, 4]);
  });

  it('a failed drawing does not block the next one', async () => {
    const draw = oneAtATime(async (n: number) => {
      if (n === 1) throw new Error('browser closed');
      return n;
    });
    const [a, b] = await Promise.allSettled([draw(1), draw(2)]);
    expect(a.status).toBe('rejected');
    expect(b).toEqual({ status: 'fulfilled', value: 2 });
  });

  it('unpacks Chromium once, however many drawings ask at the same time; a failure is retried next time', async () => {
    let calls = 0;
    const path = once(async () => {
      calls++;
      await tick(10);
      if (calls === 1) throw new Error('disk busy');
      return '/tmp/chromium';
    });
    const first = await Promise.allSettled([path(), path(), path()]);
    expect(calls).toBe(1);
    expect(first.every((r) => r.status === 'rejected')).toBe(true);
    expect(await Promise.all([path(), path()])).toEqual(['/tmp/chromium', '/tmp/chromium']);
    expect(calls).toBe(2);
  });
});

describe('the certificate function uses the guards', () => {
  it('each request gets its own server copy (Fluid off), and the function draws through oneAtATime/once', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const cfg = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'));
    expect(cfg.fluid).toBe(false);
    const fn = readFileSync(resolve(process.cwd(), 'api/certificate.mjs'), 'utf8');
    expect(fn).toMatch(/const renderOnce = oneAtATime\(/);
    expect(fn).toMatch(/const executablePath = once\(/);
  });
});
