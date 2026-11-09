// Formula goal follows the weight trend: an inline suggestion «1850 → 1810 ккал», at most once a week.
// Only in kcal_mode 'formula'; the adaptive check-in owns the goal in 'adaptive', the user in 'manual'.
import type { SQLiteDatabase } from 'expo-sqlite';
import { getSetting, saveProfile, setSetting, weightTrendAt, type Profile } from '@/db/repo';
import { addDays } from './dates';
import { dailyKcalGoal } from './nutrition';

/** Setting: local date of the last answer (Обновить / Оставить). */
const KEY = 'kcal_recalc_at';
const MIN_DIFF = 20;
const EVERY_DAYS = 7;

export interface KcalRecalc { from: number; to: number; weight: number }

export async function pendingKcalRecalc(db: SQLiteDatabase, p: Profile, today: string): Promise<KcalRecalc | null> {
  if (p.kcal_mode !== 'formula') return null;
  const last = await getSetting<string | null>(db, KEY, null);
  if (last && last > addDays(today, -EVERY_DAYS)) return null;
  const trend = await weightTrendAt(db, today);
  if (!trend) return null;
  const to = dailyKcalGoal({ ...p, weight_kg: trend.value });
  if (Math.abs(to - p.kcal_goal) < MIN_DIFF) return null;
  return { from: p.kcal_goal, to, weight: trend.value };
}

export async function answerKcalRecalc(db: SQLiteDatabase, p: Profile, r: KcalRecalc, accept: boolean, today: string): Promise<void> {
  if (accept) await saveProfile(db, { ...p, kcal_goal: r.to });
  await setSetting(db, KEY, today);
}
