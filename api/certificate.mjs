// Vercel function: POST /api/certificate {delivery_id} with X-Render-Token (see certs/server.mjs).
// Called only by the email sender (api/deliver.py). Draws the certificate with a serverless Chromium.
import chromium from '@sparticuz/chromium';
import { chromium as playwright } from 'playwright-core';
import { renderCertificate } from '../certs/render.mjs';
import { handleCertificateRequest } from '../certs/server.mjs';

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

async function upload(bucket, path, data, contentType) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'POST', headers: headers({ 'Content-Type': contentType, 'x-upsert': 'true' }), body: data,
  });
  if (!res.ok) throw new Error(`upload ${bucket}/${path}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

// One browser per warm function instance.
let browserPromise = null;
async function browser() {
  const current = browserPromise && (await browserPromise.catch(() => null));
  if (current && current.isConnected()) return current;
  browserPromise = (async () =>
    playwright.launch({ executablePath: await chromium.executablePath(), args: chromium.args, headless: true }))();
  return browserPromise;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const out = await handleCertificateRequest(
      { method: req.method, headers: req.headers, body: req.body },
      { serviceKey: SERVICE_KEY, verifyBase: VERIFY_BASE, rpc, upload, render: async (input) => renderCertificate(await browser(), input) },
    );
    res.status(out.status).json(out.body);
  } catch (e) {
    console.error('certificate function failed', e);
    res.status(500).json({ error: 'server error' });
  }
}
