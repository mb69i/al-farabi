// Builds public/brand/iraq-dots.svg: Iraq as a white halftone of dots (bigger inland, smaller at the borders)
// with a red dot on Baghdad, like the TEDxBaghdad 2026 theme artwork (owner, 26 Nov).
// Run: node scripts/make-iraq-dots.mjs
import { writeFileSync } from 'node:fs';

// Simplified border, [longitude, latitude], clockwise from the Syria–Turkey corner.
const IRAQ = [
  [42.35, 37.11], [43.0, 37.37], [44.29, 37.0], [44.77, 37.17], [45.42, 35.98], [46.08, 35.68],
  [45.65, 34.75], [45.42, 33.97], [46.11, 33.02], [47.33, 32.47], [47.85, 31.71], [47.69, 30.98],
  [48.0, 30.99], [48.57, 29.93], [47.97, 29.98], [47.3, 30.06], [46.57, 29.1], [44.71, 29.18],
  [42.08, 31.11], [40.4, 31.95], [39.2, 32.16], [38.79, 33.38], [41.0, 34.42], [41.38, 35.63],
  [41.29, 36.36], [41.84, 36.61],
];
const BAGHDAD = [44.37, 33.31];

const K = Math.cos((33.2 * Math.PI) / 180); // equirectangular, true to scale near Baghdad
const SCALE = 100;
const proj = ([lon, lat]) => [(lon - 38.6) * K * SCALE, (37.5 - lat) * SCALE];
const poly = IRAQ.map(proj);

const inside = ([x, y]) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};
const edgeDistance = ([x, y]) => {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j];
    const [bx, by] = poly[i];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
};

const STEP = 30;
const xs = poly.map((p) => p[0]);
const ys = poly.map((p) => p[1]);
const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
const [bx, by] = proj(BAGHDAD);
const dots = [];
for (let y = minY + STEP / 2, row = 0; y < maxY; y += STEP * 0.866, row++) {
  for (let x = minX + (row % 2 ? STEP / 2 : 0); x < maxX; x += STEP) {
    if (!inside([x, y])) continue;
    if (Math.hypot(x - bx, y - by) < STEP * 0.9) continue; // room for the red Baghdad dot
    const d = edgeDistance([x, y]);
    const r = Math.min(STEP * 0.46, 1.6 + d * 0.11);
    dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}"/>`);
  }
}
const pad = 12;
const w = Math.ceil(maxX - minX + pad * 2);
const h = Math.ceil(maxY - minY + pad * 2);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(minX - pad).toFixed(0)} ${(minY - pad).toFixed(0)} ${w} ${h}" role="img" aria-label="Iraq">
<g fill="#ffffff">${dots.join('')}</g>
<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${(STEP * 0.55).toFixed(1)}" fill="#e62b1e"/>
</svg>
`;
writeFileSync(new URL('../public/brand/iraq-dots.svg', import.meta.url), svg);
console.log(`iraq-dots.svg: ${dots.length} dots, ${w}x${h}`);
