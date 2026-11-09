// Merge local search hits and Open Food Facts hits into groups of near-duplicates:
// same normalised name and kcal within 10% collapse into one row with "+N вариантов".
import type { FoodInput, FoodRow } from '@/db/repo';

export type Hit = { kind: 'local'; f: FoodRow } | { kind: 'off'; f: FoodInput };
export type HitGroup = { key: string; head: Hit; rest: Hit[] };

/** lowercase, ё→е, punctuation stripped, spaces collapsed */
export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^0-9a-zà-ɏа-я]+/g, ' ')
    .trim();
}

const kcalClose = (a: number, b: number) => Math.abs(a - b) <= 0.1 * Math.max(Math.abs(a), Math.abs(b));

const hitKey = (h: Hit, i: number) => (h.kind === 'local' ? h.f.id : `off:${h.f.barcode ?? `${h.f.name}|${h.f.brand ?? ''}|${i}`}`);

/**
 * Local hits keep their order (already ranked, most used first), so the head of a group is the
 * best local match. OFF hits already saved locally (same barcode) are dropped; OFF hits that match a
 * local group join it as variants. Returns local-headed groups and OFF-only groups separately.
 */
export function groupHits(local: FoodRow[], off: FoodInput[] | null): { local: HitGroup[]; off: HitGroup[] } {
  const groups: (HitGroup & { name: string })[] = [];
  const localBarcodes = new Set(local.map((f) => f.barcode).filter(Boolean) as string[]);
  const add = (h: Hit, i: number) => {
    const name = normName(h.f.name);
    const g = name ? groups.find((x) => x.name === name && kcalClose(x.head.f.kcal, h.f.kcal)) : undefined;
    if (g) g.rest.push(h);
    else groups.push({ key: hitKey(h, i), name, head: h, rest: [] });
  };
  local.forEach((f, i) => add({ kind: 'local', f }, i));
  (off ?? []).forEach((f, i) => {
    if (f.barcode && localBarcodes.has(f.barcode)) return;
    add({ kind: 'off', f }, i);
  });
  const strip = ({ name: _n, ...g }: HitGroup & { name: string }): HitGroup => g;
  return {
    local: groups.filter((g) => g.head.kind === 'local').map(strip),
    off: groups.filter((g) => g.head.kind === 'off').map(strip),
  };
}

/** "+1 вариант", "+2 варианта", "+5 вариантов" */
export function variantsLabel(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? 'вариант' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'варианта' : 'вариантов';
  return `+${n} ${word}`;
}
