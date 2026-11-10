// Renders every picture from app/src/ui/art-data.ts to one HTML contact sheet (light and dark tiles),
// to check the drawings by eye.  Usage: node tools/preview_art.mjs out.html   (Node 22.6+)
import { writeFileSync } from 'node:fs';
import { ART } from '../app/src/ui/art-data.ts';

const attrs = (s) => {
  const a = [`fill="${s.f ?? 'none'}"`];
  if (s.s && s.w !== 0) a.push(`stroke="${s.s}" stroke-width="${s.w ?? 2}" stroke-linecap="round" stroke-linejoin="round"`);
  if (s.o != null) a.push(`opacity="${s.o}"`);
  if (s.rot) a.push(`transform="rotate(${s.rot.join(' ')})"`);
  return a.join(' ');
};
const shape = (s) =>
  s.d ? `<path d="${s.d}" ${attrs(s)}/>`
  : s.c ? `<circle cx="${s.c[0]}" cy="${s.c[1]}" r="${s.c[2]}" ${attrs(s)}/>`
  : s.e ? `<ellipse cx="${s.e[0]}" cy="${s.e[1]}" rx="${s.e[2]}" ry="${s.e[3]}" ${attrs(s)}/>`
  : `<rect x="${s.r[0]}" y="${s.r[1]}" width="${s.r[2]}" height="${s.r[3]}" rx="${s.r[4]}" ${attrs(s)}/>`;

export const svg = (art, size, tileOpacity) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${art.hue}" opacity="${tileOpacity}"/>` +
  `<g transform="translate(8 8)">${art.shapes.map(shape).join('')}</g></svg>`;

const sheet = (bg, fg, op) =>
  `<div style="background:${bg};color:${fg};padding:16px;display:grid;grid-template-columns:repeat(8,1fr);gap:12px">` +
  Object.entries(ART).map(([k, a]) => `<div style="text-align:center;font:11px sans-serif">${svg(a, 96, op)}<br>${k}<br>${svg(a, 40, op)}</div>`).join('') +
  '</div>';

if (process.argv[2]) {
  writeFileSync(process.argv[2], `<body style="margin:0">${sheet('#FFFFFF', '#16181A', 0.16)}${sheet('#1A1D1F', '#F1F3F2', 0.24)}</body>`);
}
