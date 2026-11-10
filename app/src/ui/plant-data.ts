// The app's own character: a plant in a pot that grows with the level (see lib/game.ts, 5 stages).
// Pure data in a 120×140 box, same shape format as art-data.ts.
import type { Shape } from './art-data';

const LEAF = '#4BAE5A';
const LEAF_LIGHT = '#7CCB6B';
const LEAF_DARK = '#2F8440';
const TRUNK = '#9A6337';
const INK = '#3A2416';

/** A pointed leaf growing from (x, y), `len` long, turned by `ang` degrees (0 = straight up). */
const leaf = (x: number, y: number, len: number, ang: number, f: string): Shape => ({
  d: `M${x} ${y}c${-len * 0.42} ${-len * 0.22} ${-len * 0.42} ${-len * 0.78} 0 ${-len}c${len * 0.42} ${len * 0.22} ${len * 0.42} ${len * 0.78} 0 ${len}z`,
  f,
  rot: [ang, x, y],
});

const star = (x: number, y: number, r: number): Shape => ({
  d: `M${x} ${y - r}l${r * 0.3} ${r * 0.7}l${r * 0.7} ${r * 0.3}l${-r * 0.7} ${r * 0.3}l${-r * 0.3} ${r * 0.7}l${-r * 0.3} ${-r * 0.7}l${-r * 0.7} ${-r * 0.3}l${r * 0.7} ${-r * 0.3}z`,
  f: '#F6C232',
});

const GROWTH: Shape[][] = [
  // 0 — seed: a tiny shoot
  [{ d: 'M60 88v-9', s: LEAF_DARK, w: 4 }, leaf(60, 80, 12, 50, LEAF_LIGHT)],
  // 1 — sprout: two leaves
  [{ d: 'M60 88V62', s: LEAF_DARK, w: 4.5 }, leaf(60, 66, 26, -55, LEAF), leaf(60, 62, 28, 48, LEAF_LIGHT)],
  // 2 — sapling: a stem with leaves in pairs
  [
    { d: 'M60 88V36', s: LEAF_DARK, w: 5 },
    leaf(60, 74, 24, -62, LEAF),
    leaf(60, 70, 24, 62, LEAF_LIGHT),
    leaf(60, 56, 22, -52, LEAF_LIGHT),
    leaf(60, 52, 22, 52, LEAF),
    leaf(60, 40, 22, 0, LEAF_LIGHT),
  ],
  // 3 — young tree
  [
    { d: 'M60 88V50', s: TRUNK, w: 8 },
    { d: 'M60 66l-12-10M60 62l11-9', s: TRUNK, w: 4 },
    { c: [42, 48, 17], f: LEAF_DARK },
    { c: [78, 48, 17], f: LEAF_DARK },
    { c: [60, 34, 24], f: LEAF },
    { c: [52, 28, 9], f: LEAF_LIGHT, o: 0.7 },
  ],
  // 4 — tree with fruit
  [
    { d: 'M60 88V52', s: TRUNK, w: 9 },
    { d: 'M60 68l-15-11M60 64l14-10', s: TRUNK, w: 4.5 },
    { c: [36, 48, 19], f: LEAF_DARK },
    { c: [84, 48, 19], f: LEAF_DARK },
    { c: [60, 52, 18], f: LEAF_DARK },
    { c: [60, 30, 27], f: LEAF },
    { c: [50, 22, 10], f: LEAF_LIGHT, o: 0.7 },
    { c: [40, 50, 5], f: '#E2483E' },
    { c: [70, 28, 5], f: '#E2483E' },
    { c: [82, 52, 5], f: '#E2483E' },
    { c: [56, 46, 5], f: '#F59B2B' },
    star(98, 22, 7),
    star(22, 30, 5),
  ],
];

/** `awake` = there is a live streak; otherwise the pot dozes (nothing wilts — a missed day costs nothing). */
export function plantShapes(stage: number, awake: boolean): Shape[] {
  const face: Shape[] = awake
    ? [
        { c: [50, 107, 3.2], f: INK },
        { c: [70, 107, 3.2], f: INK },
        { c: [51.200, 105.800, 1], f: '#FFFFFF' },
        { c: [71.200, 105.800, 1], f: '#FFFFFF' },
        { d: 'M53 114c4 4.500 10 4.500 14 0', s: INK, w: 2.4 },
      ]
    : [
        { d: 'M46.500 107c2 2.200 5 2.200 7 0M66.500 107c2 2.200 5 2.200 7 0', s: INK, w: 2.2 },
        { d: 'M56 115.500h8', s: INK, w: 2.2 },
        { d: 'M88 78h7l-7 8h7', s: '#8FA0AE', w: 2 },
        { d: 'M99 66h5l-5 6h5', s: '#8FA0AE', w: 1.6 },
      ];
  return [
    { e: [60, 131, 36, 5], f: '#000000', o: 0.08 },
    ...GROWTH[Math.max(0, Math.min(stage, GROWTH.length - 1))],
    { d: 'M35 92h50l-5.500 32a6 6 0 0 1-6 5H46.500a6 6 0 0 1-6-5z', f: '#E0763A' },
    { d: 'M35 92h50l-1.200 7H36.200z', f: '#C25E27', o: 0.6 },
    { r: [30, 84, 60, 11, 5], f: '#C96A2C' },
    { r: [30, 84, 60, 5, 2.500], f: '#E88A4B' },
    { c: [43.500, 113.500, 3.600], f: '#F6A27E', o: 0.75 },
    { c: [76.500, 113.500, 3.600], f: '#F6A27E', o: 0.75 },
    ...face,
  ];
}
