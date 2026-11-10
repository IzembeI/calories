// When the goal weight is likely to be reached. Not the «7700 kcal per kg, straight line» rule: as weight
// goes down the body spends less, so the curve flattens. The answer is a range of dates, never one day.
import { addDays, fromKey } from './dates';

const MAX_DAYS = 540;
const KCAL_PER_KG = 7700;

export interface Forecast {
  /** weekly points of the middle scenario, starting from today's trend weight */
  points: { date: string; value: number }[];
  /** earliest and latest date of reaching the goal; null when even the best scenario does not get there in 18 months */
  from: string | null;
  to: string | null;
}

/**
 * `intake` — average kcal actually eaten; `tdeeNow` — expenditure at the current weight;
 * `kcalPerKg` — how much the expenditure changes per kg of body weight (10 × activity factor by Mifflin).
 */
function simulate(w0: number, target: number, intake: number, tdeeNow: number, kcalPerKg: number, today: string) {
  const down = target < w0;
  const points = [{ date: today, value: w0 }];
  let w = w0;
  for (let day = 1; day <= MAX_DAYS; day++) {
    w += (intake - (tdeeNow + kcalPerKg * (w - w0))) / KCAL_PER_KG;
    if (day % 7 === 0) points.push({ date: addDays(today, day), value: w });
    if (down ? w <= target : w >= target) {
      const date = addDays(today, day);
      if (points[points.length - 1].date !== date) points.push({ date, value: target });
      return { points, reached: date };
    }
  }
  return { points, reached: null };
}

export function forecast(w0: number, target: number, intake: number, tdeeNow: number, activityFactor: number, today: string): Forecast | null {
  if (Math.abs(w0 - target) < 0.3) return null;
  const k = 10 * activityFactor;
  const run = (i: number) => simulate(w0, target, i, tdeeNow, k, today);
  const down = target < w0;
  const mid = run(intake);
  const fast = run(intake + (down ? -100 : 100));
  const slow = run(intake + (down ? 100 : -100));
  // moving away from the goal or standing still: nothing honest to show
  if (!mid.reached && !fast.reached) return { points: [], from: null, to: null };
  return { points: mid.points, from: fast.reached, to: slow.reached };
}

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/** «ориентировочно март–апрель 2027», «ориентировочно в июне 2027 или позже» */
export function forecastText(f: Forecast): string {
  if (!f.from) return 'При текущем питании цель не приближается.';
  const a = fromKey(f.from);
  if (!f.to) return `ориентировочно ${MONTHS[a.getMonth()]} ${a.getFullYear()} или позже`;
  const b = fromKey(f.to);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return `ориентировочно ${MONTHS[a.getMonth()]} ${a.getFullYear()}`;
  return a.getFullYear() === b.getFullYear()
    ? `ориентировочно ${MONTHS[a.getMonth()]}–${MONTHS[b.getMonth()]} ${b.getFullYear()}`
    : `ориентировочно ${MONTHS[a.getMonth()]} ${a.getFullYear()} – ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}
