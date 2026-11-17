// Size budget for the public registration page. Run after `npm run build`.
// Usage: node scripts/check-bundle.mjs   (exit 1 when over budget)
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 75; // gzip, JS + CSS needed before the form can render
const html = readFileSync('dist/index.html', 'utf8');
const files = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
let total = 0;
const problems = [];
for (const f of files) {
  const buf = readFileSync(`dist/${f}`);
  const kb = gzipSync(buf).length / 1024;
  total += kb;
  console.log(`${kb.toFixed(1).padStart(7)} KB gz  ${f}`);
  const text = buf.toString('utf8');
  if (/GoTrueClient|RealtimeClient/.test(text)) problems.push(`${f} contains supabase-js`);
  if (/QR Code|qrcode/i.test(text) && f.endsWith('.js') && /toDataURL/.test(text)) problems.push(`${f} contains qrcode`);
}
console.log(`${total.toFixed(1).padStart(7)} KB gz  total (budget ${BUDGET_KB} KB)`);
if (total > BUDGET_KB) problems.push(`over budget: ${total.toFixed(1)} KB > ${BUDGET_KB} KB`);
if (/fonts\.googleapis/.test(html)) problems.push('index.html still loads Google Fonts');
if (problems.length) {
  console.error('FAIL\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('OK');
