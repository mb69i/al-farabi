// @vitest-environment node
// Researcher attendance card (owner, 20 Nov): emailed as soon as a doctor signs; the paper certificate comes later.
import { PNG } from 'pngjs';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderCard } from './render.mjs';
import { buildCardValues, CertificateError } from './values.mjs';

const input = {
  name: 'Layla Hassan',
  org: 'American University of Beirut',
  title: 'Trust in AI-assisted medical decisions',
  dateFrom: '2026-11-21',
  dateTo: '2026-11-22',
};

describe('card values', () => {
  it('fills name, institution, research title and the Arabic dates, all HTML-escaped', () => {
    const v = buildCardValues({ ...input, name: 'علي <b>حسن</b>' });
    expect(v.NAME).toBe('علي &lt;b&gt;حسن&lt;/b&gt;');
    expect(v.ORG).toBe('American University of Beirut');
    expect(v.TITLE).toBe('Trust in AI-assisted medical decisions');
    expect(v.DATES).toBe('21 – 22 تشرين الثاني 2026');
  });

  it('never draws a card without a name, a research title or valid dates; institution may be empty', () => {
    expect(() => buildCardValues({ ...input, name: ' ' })).toThrow(CertificateError);
    expect(() => buildCardValues({ ...input, title: '' })).toThrow(CertificateError);
    expect(() => buildCardValues({ ...input, dateTo: '2026-13-40' })).toThrow(CertificateError);
    expect(buildCardValues({ ...input, org: null }).ORG).toBe('');
  });
});

const hasBrowser = Boolean(process.env.PLAYWRIGHT_BROWSERS_PATH);

describe.skipIf(!hasBrowser)('renderCard (Chromium)', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
  });

  it('a 2400 x 1500 PNG with Cairo and the three logos loaded', async () => {
    const out = await renderCard(browser, input);
    const png = PNG.sync.read(out.png);
    expect([png.width, png.height]).toEqual([2400, 1500]);
    expect(out.state).toMatchObject({ fonts: true, images: true, fits: true, overflow: false });
  }, 60_000);

  it('a very long Arabic name and title still fit (shrunk or on two/three lines)', async () => {
    const out = await renderCard(browser, {
      ...input,
      name: 'الأستاذ الدكتور عبد الرحمن محمد صالح الجبوري العبيدي (تجريبي)',
      org: 'جامعة تكنولوجيا المعلومات والاتصالات — كلية هندسة البرمجيات',
      title: 'تطبيقات الذكاء الاصطناعي التوليدي في تحليل البيانات الضخمة لتحسين جودة الخدمات الصحية والتعليمية في المؤسسات الحكومية العراقية',
    });
    expect(out.state.fits).toBe(true);
    expect(out.state.overflow).toBe(false);
  }, 60_000);
});
