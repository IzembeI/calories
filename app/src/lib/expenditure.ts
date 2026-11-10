// Real energy expenditure from the diary and the weight trend (what MacroFactor calls adaptive TDEE):
// what you ate minus what the change in weight says you stored or burned. Pure functions, no database.
import type { DayTotals } from '@/db/repo';
import { addDays, diffDays } from './dates';
import { kcalFloor, tdee as formulaTdee, type BodyInput } from './nutrition';
import { trendAt, type TrendPoint } from './trend';

export const WINDOW_DAYS = 28;
export const MIN_LOGGED = 10;
export const MIN_SPAN_DAYS = 14;
export const MIN_WEIGH_INS = 4;
const KCAL_PER_KG = 7700;
/** A day counts as filled in when it has at least this share of the goal: a lone coffee is not a day. */
const LOGGED_SHARE = 0.4;
/** The goal never moves by more than this in one weekly check-in. */
const MAX_STEP = 150;

export interface Expenditure {
  /** estimated kcal per day */
  tdee: number;
  /** ± kcal: how rough the estimate still is */
  band: number;
  loggedDays: number;
  spanDays: number;
  /** kg per week over the window, by the trend */
  perWeek: number;
  /** what the Mifflin formula gives for the same weight */
  formula: number;
}

export type ExpenditureResult =
  | { ok: true; e: Expenditure }
  | { ok: false; reason: 'paused' | 'few_days' | 'few_weigh_ins'; loggedDays: number; weighIns: number };

/**
 * `days` — diary totals, any range; `series` — the full weight trend; `body` — profile with the current trend weight.
 * Uses the last 28 finished days. Unfilled days are simply left out, they do not drag the average down.
 */
export function estimateExpenditure(days: DayTotals[], series: TrendPoint[], body: BodyInput, kcalGoal: number, today: string): ExpenditureResult {
  const to = addDays(today, -1);
  const from = addDays(to, -(WINDOW_DAYS - 1));
  const logged = days.filter((d) => d.date >= from && d.date <= to && d.kcal >= kcalGoal * LOGGED_SHARE);
  const weighIns = series.filter((p) => p.date >= from && p.date <= today).length;
  const fail = (reason: 'paused' | 'few_days' | 'few_weigh_ins'): ExpenditureResult => ({ ok: false, reason, loggedDays: logged.length, weighIns });

  if (logged.length < MIN_LOGGED) return fail('few_days');
  // more than 3 of the last 7 days empty: the diary has a gap right now, wait until it is filled again
  const lastWeek = addDays(to, -6);
  if (logged.filter((d) => d.date >= lastWeek).length < 4) return fail('paused');
  if (!series.length || weighIns < MIN_WEIGH_INS) return fail('few_weigh_ins');

  const start = from > series[0].date ? from : series[0].date;
  const lastWeigh = series[series.length - 1].date;
  const end = lastWeigh < today ? lastWeigh : today;
  const spanDays = diffDays(start, end);
  const a = trendAt(series, start);
  const b = trendAt(series, end);
  if (spanDays < MIN_SPAN_DAYS || a == null || b == null) return fail('few_weigh_ins');

  const used = logged.filter((d) => d.date >= start && d.date <= end);
  if (used.length < MIN_LOGGED) return fail('few_days');
  const intake = used.reduce((s, d) => s + d.kcal, 0) / used.length;
  const adaptive = intake - ((b - a) * KCAL_PER_KG) / spanDays;
  const formula = formulaTdee(body);
  // little data → lean on the formula; four full weeks → trust the measurement
  const w = Math.min(Math.max((used.length - 7) / 21, 0), 1);
  // a wild number means bad data (missed entries, water swings); keep it within ±35% of the formula
  const tdee = Math.min(Math.max(w * adaptive + (1 - w) * formula, formula * 0.65), formula * 1.35);
  return {
    ok: true,
    e: { tdee: Math.round(tdee / 10) * 10, band: used.length >= 24 ? 120 : 200, loggedDays: used.length, spanDays, perWeek: ((b - a) / spanDays) * 7, formula: Math.round(formula / 10) * 10 },
  };
}

export interface GoalSuggestion { from: number; to: number; reason: string }

/** New daily goal from the measured expenditure and the planned pace; null when the current goal is close enough. */
export function suggestGoal(e: Expenditure, body: BodyInput, kcalGoal: number): GoalSuggestion | null {
  const perDay = (body.pace_kg_week * KCAL_PER_KG) / 7;
  let target = body.goal === 'lose' ? e.tdee - perDay : body.goal === 'gain' ? e.tdee + perDay : e.tdee;
  if (body.goal === 'lose') target = Math.max(target, kcalFloor(body.sex));
  target = Math.min(Math.max(target, kcalGoal - MAX_STEP), kcalGoal + MAX_STEP);
  const to = Math.round(target / 10) * 10;
  if (Math.abs(to - kcalGoal) < 30) return null;

  // what the current goal really gives at the measured expenditure, against the plan
  const perWeek = (Math.abs(e.tdee - kcalGoal) * 7) / KCAL_PER_KG;
  const kg = (x: number) => x.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  const reason =
    body.goal === 'maintain'
      ? 'Чтобы вес держался, норма должна равняться расходу.'
      : body.goal === 'lose'
        ? e.tdee <= kcalGoal
          ? 'При нынешней норме дефицита нет: расход не больше нормы.'
          : `При нынешней норме дефицит ${Math.round(e.tdee - kcalGoal)} ккал — это около ${kg(perWeek)} кг в неделю при плане ${kg(body.pace_kg_week)}.`
        : e.tdee >= kcalGoal
          ? 'При нынешней норме профицита нет: расход не меньше нормы.'
          : `При нынешней норме профицит ${Math.round(kcalGoal - e.tdee)} ккал — это около ${kg(perWeek)} кг в неделю при плане ${kg(body.pace_kg_week)}.`;
  return { from: kcalGoal, to, reason };
}
