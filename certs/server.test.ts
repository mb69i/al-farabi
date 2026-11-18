// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { handleCertificateRequest, renderToken } from './server.mjs';
import { CertificateError } from './values.mjs';

const KEY = 'test-service-key';
const TOKEN = 'f2206785ce5cb9e4d3fc7033f96caf11712dd0f1141f34c53c2eb9120fef9a10'; // same vector as tests/py/test_certremote.py
const DID = '0b0c3f9e-7d1a-4f43-9a51-2d7f2a1f0c11';
const JOB = {
  event_id: 'e4c4d046-5363-46b8-ab1b-518ed870c53c', serial: 'ALF26-TNTX-X2PL-7QTP', name: 'ضيف تجريبي', org: 'حساب تجريبي',
  role: 'attendee', date_from: '2026-11-21', date_to: '2026-11-22',
};

function deps(over = {}) {
  return {
    serviceKey: KEY,
    verifyBase: 'https://al-farabi-gilt.vercel.app',
    rpc: vi.fn(async () => JOB),
    upload: vi.fn(async () => undefined),
    render: vi.fn(async () => ({ pdf: Buffer.from('%PDF-1.4 x'), serial: JOB.serial })),
    ...over,
  };
}
const req = (over = {}) => ({ method: 'POST', headers: { 'x-render-token': TOKEN }, body: { delivery_id: DID }, ...over });

describe('render token', () => {
  it('is an HMAC of the service key that Python computes the same way', () => {
    expect(renderToken(KEY)).toBe(TOKEN);
  });
});

describe('handleCertificateRequest', () => {
  it('draws, stores and returns the PDF path for one delivery', async () => {
    const d = deps();
    const out = await handleCertificateRequest(req(), d);
    expect(out).toEqual({ status: 200, body: { path: `${JOB.event_id}/certificate/${DID}.pdf`, serial: JOB.serial } });
    expect(d.rpc).toHaveBeenCalledWith('certificate_job', { p_delivery_id: DID });
    expect(d.render).toHaveBeenCalledWith({
      name: JOB.name, org: JOB.org, role: 'attendee', dateFrom: '2026-11-21', dateTo: '2026-11-22',
      serial: JOB.serial, verifyBase: 'https://al-farabi-gilt.vercel.app', variant: 'plain',
    });
    expect(d.upload).toHaveBeenCalledWith('outputs', `${JOB.event_id}/certificate/${DID}.pdf`, Buffer.from('%PDF-1.4 x'), 'application/pdf');
  });

  it('refuses anything without the right token, and works only when the server has its key', async () => {
    expect((await handleCertificateRequest(req({ headers: {} }), deps())).status).toBe(401);
    expect((await handleCertificateRequest(req({ headers: { 'x-render-token': 'nope' } }), deps())).status).toBe(401);
    expect((await handleCertificateRequest(req(), deps({ serviceKey: '' }))).status).toBe(401);
    expect((await handleCertificateRequest(req({ method: 'GET' }), deps())).status).toBe(405);
  });

  it('only a delivery id goes in', async () => {
    const d = deps();
    expect((await handleCertificateRequest(req({ body: { delivery_id: '../x' } }), d)).status).toBe(400);
    expect((await handleCertificateRequest(req({ body: null }), d)).status).toBe(400);
    expect(d.rpc).not.toHaveBeenCalled();
  });

  it('unknown delivery is 404; a certificate that cannot be drawn is 422 and nothing is stored', async () => {
    expect((await handleCertificateRequest(req(), deps({ rpc: vi.fn(async () => null) }))).status).toBe(404);
    const d = deps({ render: vi.fn(async () => { throw new CertificateError('missing name'); }) });
    expect(await handleCertificateRequest(req(), d)).toEqual({ status: 422, body: { error: 'missing name' } });
    expect(d.upload).not.toHaveBeenCalled();
  });
});
