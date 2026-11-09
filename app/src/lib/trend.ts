// Weight trend (Hacker's Diet style exponentially smoothed moving average).
// The trend is anchored at the last weigh-in, never extrapolated to "today".
import { addDays, diffDays } from './dates';

export interface TrendPoint { date: string; raw: number; trend: number }

/** EWMA with 10% smoothing per day; gaps of d days weigh the new point 1 - 0.9^d. */
export function ewma(points: { date: string; value: number }[]): TrendPoint[] {
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out: TrendPoint[] = [];
  let t = 0;
  sorted.forEach((p, i) => {
    if (i === 0) t = p.value;
    else {
      const d = Math.max(diffDays(sorted[i - 1].date, p.date), 1);
      t += (1 - Math.pow(0.9, d)) * (p.value - t);
    }
    out.push({ date: p.date, raw: p.value, trend: t });
  });
  return out;
}

/** Trend value on a date, linearly interpolated between weigh-ins. Null outside the series. */
export function trendAt(series: TrendPoint[], date: string): number | null {
  if (!series.length || date < series[0].date || date > series[series.length - 1].date) return null;
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1];
    const b = series[i];
    if (date <= b.date) {
      const span = diffDays(a.date, b.date);
      return span ? a.trend + ((b.trend - a.trend) * diffDays(a.date, date)) / span : b.trend;
    }
  }
  return series[0].trend;
}

export const MIN_WEIGH_INS = 4;
export const SLOPE_DAYS = 14;
/** The smoothed line is drawn starting from this weigh-in (index), the first ones are mostly the seed. */
export const TREND_FROM = 2;

export interface WeightTrend {
  series: TrendPoint[];
  /** Trend on the last weigh-in date. */
  value: number;
  /** Date of the last weigh-in, the trend is "на" this date. */
  date: string;
  /** kg per week, null when there are fewer than MIN_WEIGH_INS weigh-ins in the last SLOPE_DAYS days. */
  perWeek: number | null;
}

export function weightTrend(points: { date: string; value: number }[]): WeightTrend | null {
  const series = ewma(points);
  if (!series.length) return null;
  const last = series[series.length - 1];
  const start = addDays(last.date, -SLOPE_DAYS);
  const recent = series.filter((p) => p.date > start).length;
  // Shorter history (but at least a week): measure from the first weigh-in.
  const from = start >= series[0].date ? start : series[0].date;
  const days = diffDays(from, last.date);
  const past = trendAt(series, from);
  const perWeek = recent >= MIN_WEIGH_INS && days >= 7 && past != null ? ((last.trend - past) / days) * 7 : null;
  return { series, value: last.trend, date: last.date, perWeek };
}

const pad = (n: number) => String(n).padStart(2, '0');
const ru = (n: number, digits: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** «−0,45 кг/нед» with a real minus sign. */
export function formatPace(perWeek: number): string {
  const v = Math.round(perWeek * 100) / 100;
  return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${ru(Math.abs(v), 2)} кг/нед`;
}

/** Headline «Тренд 82,4 кг · −0,45 кг/нед» and a note «на 10.11» or why the pace is missing. */
export function trendText(t: WeightTrend): { title: string; note: string } {
  const [, m, d] = t.date.split('-').map(Number);
  const on = `на ${pad(d)}.${pad(m)}`;
  const title = `Тренд ${ru(t.value, 1)} кг${t.perWeek != null ? ` · ${formatPace(t.perWeek)}` : ''}`;
  return { title, note: t.perWeek != null ? on : `${on} · мало взвешиваний для темпа` };
}

/** Setting 'weigh_hint': how often the user weighs in. Shown as a one-line tip, never as a pop-up. */
export type WeighHint = 'daily' | 'weekly';
export const WEIGH_HINTS: Record<WeighHint, string> = {
  daily: 'Взвешивайтесь утром натощак — линия тренда сглаживает колебания воды.',
  weekly: 'Темп появится, когда за 2 недели будет 4 взвешивания или больше.',
};
