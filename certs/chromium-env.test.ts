// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const KEYS = ['VERCEL', 'AWS_LAMBDA_JS_RUNTIME', 'AWS_EXECUTION_ENV'] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.resetModules();
});

describe('serverless Chromium runtime hint', () => {
  it('on Vercel, tells @sparticuz/chromium it runs on Amazon Linux 2023 (Node 22) so it unpacks the right libraries', async () => {
    process.env.VERCEL = '1';
    delete process.env.AWS_LAMBDA_JS_RUNTIME;
    delete process.env.AWS_EXECUTION_ENV;
    await import('./chromium-env.mjs');
    expect(process.env.AWS_LAMBDA_JS_RUNTIME).toBe('nodejs22.x');
  });

  it('leaves a laptop (not Vercel) alone', async () => {
    delete process.env.VERCEL;
    delete process.env.AWS_LAMBDA_JS_RUNTIME;
    await import('./chromium-env.mjs');
    expect(process.env.AWS_LAMBDA_JS_RUNTIME).toBeUndefined();
  });
});
