// Body composition from tape measurements: US Navy body-fat formula (Hodgdon & Beckett, ±4% vs DXA)
// and waist-to-height ratio (NICE NG246). Estimates only; the Navy formula needs its own measuring sites.
import type { Sex } from './nutrition';
import { bmi, fmt } from './nutrition';

/** Typical error of the Navy formula against DXA, in percentage points. */
export const NAVY_ERROR_PCT = 4;

/** Settings key: the user confirmed once that they measure the way the Navy formula expects. */
export const BODYFAT_METHOD_KEY = 'bodyfat_method_ok';

/** Virtual series type for /series/[type]: body fat % joined from waist, neck (and hips for women). */
export const BODYFAT_TYPE = 'bodyfat';

/** Where to put the tape for the Navy formula. Shown on the waist, neck and hips fields. */
export function measureHint(type: string, sex: Sex): string | null {
  if (type === 'waist') return sex === 'male' ? 'на уровне пупка, на выдохе' : 'в самом узком месте, на выдохе';
  if (type === 'neck') return 'сразу под кадыком, лента чуть ниже спереди';
  if (type === 'hips') return 'по самой выступающей точке ягодиц';
  return null;
}

/** Body fat % by the US Navy formula (cm). Null when the input can't give a sane value. */
export function navyBodyFat(sex: Sex, heightCm: number, waist: number, neck: number, hips?: number | null): number | null {
  if (!(heightCm > 0 && waist > 0 && neck > 0)) return null;
  let bf: number;
  if (sex === 'male') {
    if (waist <= neck) return null;
    bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(heightCm)) - 450;
  } else {
    if (!(hips != null && hips > 0) || waist + hips <= neck) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(waist + hips - neck) + 0.221 * Math.log10(heightCm)) - 450;
  }
  return Number.isFinite(bf) && bf >= 2 && bf <= 70 ? bf : null;
}

export const whtr = (waist: number, heightCm: number): number | null => (waist > 0 && heightCm > 0 ? waist / heightCm : null);

export type WhtrZone = 'low' | 'ok' | 'raised' | 'high';

/** NICE NG246: < 0.4 low, 0.4–0.49 healthy, 0.5–0.59 increased risk, ≥ 0.6 high risk. */
export function whtrZone(r: number): WhtrZone {
  if (r < 0.4) return 'low';
  if (r < 0.5) return 'ok';
  if (r < 0.6) return 'raised';
  return 'high';
}

export const WHTR_LABEL: Record<WhtrZone, string> = {
  low: 'ниже нормы',
  ok: 'норма',
  raised: 'повышенный риск',
  high: 'высокий риск',
};

/** WHtR is not reliable at BMI ≥ 35 (NICE), so it is hidden then. */
export const whtrApplies = (weightKg: number | null | undefined, heightCm: number) =>
  weightKg == null || !(heightCm > 0) || bmi(weightKg, heightCm) < 35;

/** ACE body-fat categories. */
export function aceCategory(sex: Sex, bf: number): string {
  const [essential, athlete, fit, avg] = sex === 'male' ? [6, 14, 18, 25] : [14, 21, 25, 32];
  if (bf < essential) return 'необходимый минимум';
  if (bf < athlete) return 'спортивный';
  if (bf < fit) return 'подтянутый';
  if (bf < avg) return 'средний';
  return 'избыточный';
}

/** Minzdrav RF «Ожирение»: abdominal obesity at waist > 94 cm (men) / > 80 cm (women). */
export const abdominalFlag = (sex: Sex, waist: number) => waist > (sex === 'male' ? 94 : 80);
export const abdominalLimit = (sex: Sex) => (sex === 'male' ? 94 : 80);

export interface Composition {
  bf: number;
  fatKg: number | null;
  leanKg: number | null;
}

export function composition(sex: Sex, heightCm: number, weightKg: number | null | undefined, waist: number, neck: number, hips?: number | null): Composition | null {
  const bf = navyBodyFat(sex, heightCm, waist, neck, hips);
  if (bf == null) return null;
  const fatKg = weightKg != null && weightKg > 0 ? (weightKg * bf) / 100 : null;
  return { bf, fatKg, leanKg: fatKg != null ? weightKg! - fatKg : null };
}

/** «около 24% (±4%) · жир 19 кг · без жира 61 кг» */
export function compositionText(c: Composition): string {
  let s = `около ${fmt(c.bf, 0)}% (±${NAVY_ERROR_PCT}%)`;
  if (c.fatKg != null && c.leanKg != null) s += ` · жир ${fmt(c.fatKg, 1)} кг · без жира ${fmt(c.leanKg, 1)} кг`;
  return s;
}

/** «0,52 — повышенный риск» */
export const whtrText = (r: number) => `${fmt(r, 2)} — ${WHTR_LABEL[whtrZone(r)]}`;

export interface CompositionPoint extends Composition {
  date: string;
}

/**
 * Body fat by date: only dates where waist and neck (plus hips for women) were measured the same day.
 * Weight for fat/lean kg is the latest weigh-in on or before that date (else the first one after).
 */
export function compositionSeries(rows: { date: string; type: string; value: number }[], sex: Sex, heightCm: number): CompositionPoint[] {
  const byDate = new Map<string, Record<string, number>>();
  for (const r of rows) byDate.set(r.date, { ...(byDate.get(r.date) ?? {}), [r.type]: r.value });
  const weights = rows.filter((r) => r.type === 'weight').sort((a, b) => a.date.localeCompare(b.date));
  const weightAt = (d: string) => {
    let w: number | null = null;
    for (const r of weights) {
      if (r.date > d) return w ?? r.value;
      w = r.value;
    }
    return w;
  };
  const out: CompositionPoint[] = [];
  for (const date of [...byDate.keys()].sort()) {
    const v = byDate.get(date)!;
    if (v.waist == null || v.neck == null) continue;
    const c = composition(sex, heightCm, weightAt(date), v.waist, v.neck, v.hips);
    if (c) out.push({ date, ...c });
  }
  return out;
}
