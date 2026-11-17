// Sample certificates for the owner to approve before anything is sent.
// Usage: PLAYWRIGHT_BROWSERS_PATH=D:\antigravity\.pw-browsers node certs/samples.ts [outDir]
// Serials here are made up (right format, not in the database), so their QR opens "not found".
import { randomInt } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { renderCertificate } from './render.ts';
import type { CertificateInput } from './values.ts';

const out = resolve(process.argv[2] ?? 'certs/samples');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(32)]).join('');
const serial = () => `ALF26-${group()}-${group()}-${group()}`;
const verifyBase = process.env.VERIFY_BASE_URL ?? 'https://al-farabi-gilt.vercel.app';

const samples: [string, Omit<CertificateInput, 'serial' | 'verifyBase'>][] = [
  ['1-short-oneday-plain', { name: 'علي حسن', org: 'جامعة بغداد', role: 'attendee', dateFrom: '2026-11-21', dateTo: '2026-11-21', variant: 'plain' }],
  ['2-long-twodays-plain', {
    name: 'الأستاذ الدكتور عبد الرحمن محمد صالح الجبوري', org: 'جامعة تكنولوجيا المعلومات والاتصالات — كلية هندسة البرمجيات',
    role: 'researcher', dateFrom: '2026-11-21', dateTo: '2026-11-22', variant: 'plain',
  }],
  ['3-short-twodays-sponsors', { name: 'م. سارة كريم', org: 'وزارة الاتصالات', role: 'attendee', dateFrom: '2026-11-21', dateTo: '2026-11-22', variant: 'sponsors' }],
  ['4-verylong-oneday-sponsors', {
    name: 'الأستاذ المساعد الدكتورة زينب عبد الأمير جواد كاظم الموسوي الحسيني', org: 'الجامعة المستنصرية — كلية العلوم — قسم علوم الحاسوب',
    role: 'researcher', dateFrom: '2026-11-22', dateTo: '2026-11-22', variant: 'sponsors',
  }],
  ['5-english-name-noorg', { name: 'Dr. John A. Smith', org: '', role: 'attendee', dateFrom: '2026-11-21', dateTo: '2026-11-22', variant: 'plain' }],
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
try {
  const preview = await browser.newPage({ viewport: { width: 1170, height: 827 } });
  for (const [file, s] of samples) {
    const r = await renderCertificate(browser, { ...s, serial: serial(), verifyBase });
    await writeFile(resolve(out, `${file}.png`), r.png);
    await writeFile(resolve(out, `${file}.pdf`), r.pdf);
    // small copy for a phone screen
    await preview.setContent(`<style>html,body{margin:0}img{width:1170px;height:827px;display:block}</style><img src="data:image/png;base64,${r.png.toString('base64')}">`);
    await writeFile(resolve(out, `${file}-preview.jpg`), await preview.screenshot({ type: 'jpeg', quality: 88 }));
    console.log(`${file}: ${r.serial} name lines ${r.name.lines}, QR ok, png ${(r.png.length / 1e6).toFixed(1)} MB, pdf ${(r.pdf.length / 1e6).toFixed(1)} MB`);
  }
} finally {
  await browser.close();
}
