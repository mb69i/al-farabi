// Renders one certificate from a JSON file (a CertificateInput) into <outDir>/<serial>.pdf and .jpg.
// Usage: PLAYWRIGHT_BROWSERS_PATH=D:\antigravity\.pw-browsers node certs/render-one.ts input.json outDir
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { renderCertificate } from './render.ts';

const [inputPath, outDir = 'certs/samples'] = process.argv.slice(2);
if (!inputPath) throw new Error('usage: node certs/render-one.ts input.json [outDir]');
const input = JSON.parse(await readFile(inputPath, 'utf8'));
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  const r = await renderCertificate(browser, input);
  await writeFile(resolve(outDir, `${r.serial}.pdf`), r.pdf);
  await writeFile(resolve(outDir, `${r.serial}.jpg`), r.jpg);
  console.log(JSON.stringify({ serial: r.serial, url: r.url, pdfBytes: r.pdf.length, qr: 'ok' }));
} finally {
  await browser.close();
}
