// «Калорийный график»: some weekdays get more calories, the others get less, the weekly sum stays the same.
// The setting lives in a module-level variable (loaded at startup by lib/app-state.tsx), like the day start hour.
import { weekdayIndex } from './dates';
import { kcalFloor, type Sex } from './nutrition';

/** `days` — weekday indexes, 0 = Monday … 6 = Sunday; `bonus` — extra kcal on each of those days. */
export interface KcalSchedule { days: number[]; bonus: number }

export const NO_SCHEDULE: KcalSchedule = { days: [], bonus: 0 };
let current: KcalSchedule = NO_SCHEDULE;

export function setKcalSchedule(s: KcalSchedule | null | undefined): void {
  const days = Array.isArray(s?.days) ? [...new Set(s.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
  const bonus = Number.isFinite(s?.bonus) ? Math.round(s!.bonus) : 0;
  current = days.length > 0 && days.length < 7 && bonus > 0 ? { days, bonus } : NO_SCHEDULE;
}

export const getKcalSchedule = () => current;

/** «Перерыв в диете»: until this date (inclusive) every day gets the maintenance calories instead of the goal. */
export interface DietBreak { until: string; kcal: number }
let dietBreak: DietBreak | null = null;
export function setDietBreak(b: DietBreak | null | undefined): void {
  dietBreak = b && typeof b.until === 'string' && b.kcal > 0 ? b : null;
}
/** The break that covers `date`, if any. */
export const dietBreakOn = (date: string): DietBreak | null => (dietBreak && date <= dietBreak.until ? dietBreak : null);
export const scheduleOn = (s: KcalSchedule = current) => s.days.length > 0 && s.bonus > 0;

/** Goals of a «high» day and of a usual day; the usual day never goes below the safe floor, the high day gives the rest. */
export function scheduleGoals(base: number, sex: Sex, s: KcalSchedule = current): { high: number; low: number } {
  if (!scheduleOn(s)) return { high: base, low: base };
  const n = s.days.length;
  const low = Math.max(Math.round((base - (s.bonus * n) / (7 - n)) / 10) * 10, Math.min(kcalFloor(sex), base));
  // whatever the usual days could not give up stays out of the high days: the week still sums to 7 × base
  const high = Math.round((base * 7 - low * (7 - n)) / n / 10) * 10;
  return { high, low };
}

/** Calorie goal of a diary day. */
export function goalForDate(p: { kcal_goal: number; sex: Sex }, date: string, s: KcalSchedule = current): number {
  const b = dietBreakOn(date);
  if (b) return b.kcal;
  if (!scheduleOn(s)) return p.kcal_goal;
  const g = scheduleGoals(p.kcal_goal, p.sex, s);
  return s.days.includes(weekdayIndex(date)) ? g.high : g.low;
}
