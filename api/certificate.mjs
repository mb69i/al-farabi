// Vercel function: POST /api/certificate {delivery_id} with X-Render-Token (see certs/server.mjs).
// Called only by the email sender (api/deliver.py). Draws the certificate with a serverless Chromium.
import '../certs/chromium-env.mjs'; // first: sets the runtime hint @sparticuz/chromium reads when it loads
import chromium from '@sparticuz/chromium';
import { chromium as playwright } from 'playwright-core';
import { renderCertificate } from '../certs/render.mjs';
import { handleCertificateRequest } from '../certs/server.mjs';
import { once, oneAtATime } from '../certs/serial.mjs';

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const VERIFY_BASE = process.env.SITE_URL || 'https://al-farabi-gilt.vercel.app';

// New sb_secret_ keys go in the apikey header only; legacy service_role JWTs also as Bearer (as engine/supa.py).
function headers(extra) {
  const h = { apikey: SERVICE_KEY, ...extra };
  if (!SERVICE_KEY.startsWith('sb_')) h.Authorization = `Bearer ${SERVICE_KEY}`;
  return h;
}

async function rpc(name, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`rpc ${name}: ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

// Chromium is unpacked to /tmp once per server copy (parallel unpacking failed with "spawn ETXTBSY").
const executablePath = once(() => chromium.executablePath());

// A fresh browser per certificate: the serverless Chromium runs single-process, and a browser left over from
// an earlier (possibly failed) request is the most common cause of "Target ... has been closed" errors.
// One drawing at a time per server copy: parallel browsers in one copy crashed each other (load test 20 Nov).
const renderOnce = oneAtATime(async (input) => {
  const browser = await playwright.launch({ executablePath: await executablePath(), args: chromium.args, headless: true });
  try {
    return await renderCertificate(browser, input);
  } finally {
    await browser.close().catch(() => {});
  }
});

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const out = await handleCertificateRequest(
      { method: req.method, headers: req.headers, body: req.body },
      { serviceKey: SERVICE_KEY, verifyBase: VERIFY_BASE, rpc, render: renderOnce },
    );
    res.status(out.status).json(out.body);
  } catch (e) {
    console.error('certificate function failed', e);
    res.status(500).json({ error: 'server error' });
  }
}
