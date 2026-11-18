// Core of the site's certificate function (api/certificate.mjs), kept free of HTTP and Chromium for tests.
// The email sender (Python, api/deliver.py) calls it with one delivery id; this issues the serial, draws the
// certificate on the owner's forma, stores the PDF in the private 'outputs' bucket and returns its path.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { CertificateError } from './values.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Shared token: HMAC of the server's secret key, so the key itself never travels. Python: engine/certremote.py */
export const renderToken = (serviceKey) => createHmac('sha256', serviceKey).update('certificate-render-v1').digest('hex');

function tokenOk(given, serviceKey) {
  if (!serviceKey || typeof given !== 'string') return false;
  const want = Buffer.from(renderToken(serviceKey));
  const got = Buffer.from(given);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * @param {{ method: string, headers: Record<string, string | undefined>, body: any }} req
 * @param {{ serviceKey: string, verifyBase: string, rpc: (name: string, args: object) => Promise<any>,
 *           upload: (bucket: string, path: string, data: Buffer, type: string) => Promise<void>,
 *           render: (input: import('./values.mjs').CertificateInput) => Promise<{ pdf: Buffer, serial: string }> }} deps
 */
export async function handleCertificateRequest(req, deps) {
  if (req.method !== 'POST') return { status: 405, body: { error: 'method not allowed' } };
  if (!tokenOk(req.headers['x-render-token'], deps.serviceKey)) return { status: 401, body: { error: 'unauthorized' } };
  const id = req.body && typeof req.body === 'object' ? req.body.delivery_id : null;
  if (typeof id !== 'string' || !UUID.test(id)) return { status: 400, body: { error: 'bad request' } };

  const job = await deps.rpc('certificate_job', { p_delivery_id: id });
  if (!job) return { status: 404, body: { error: 'no such certificate delivery' } };

  let out;
  try {
    out = await deps.render({
      name: job.name, org: job.org, role: job.role, dateFrom: job.date_from, dateTo: job.date_to,
      serial: job.serial, verifyBase: deps.verifyBase, variant: 'plain',
    });
  } catch (e) {
    if (e instanceof CertificateError) return { status: 422, body: { error: e.message } };
    // Only an authenticated caller (the sender) gets here; it saves the reason on the delivery for staff.
    return { status: 500, body: { error: `render failed: ${String(e?.message ?? e).slice(0, 300)}` } };
  }
  const path = `${job.event_id}/certificate/${id}.pdf`;
  await deps.upload('outputs', path, out.pdf, 'application/pdf');
  return { status: 200, body: { path, serial: out.serial } };
}
