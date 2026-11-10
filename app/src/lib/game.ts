// Levels, streaks and achievements. Everything is derived from the diary and the measurements on the fly:
// nothing extra is stored, so a restored backup brings the progress back with it.
// The tone is calm on purpose: points only grow, a missed day takes nothing away.
import type { DayTotals } from '@/db/repo';
import { addDays, weekStart } from './dates';
import type { Goal } from './nutrition';

export const XP = { logged: 10, kcal: 15, protein: 10, measureWeek: 20 };

/** Calorie corridor that counts as «в норме», as shares of the goal. */
export function kcalBand(goal: Goal): [number, number] {
  return goal === 'lose' ? [0.85, 1.05] : goal === 'gain' ? [0.95, 1.15] : [0.9, 1.1];
}

export const inKcalBand = (kcal: number, kcalGoal: number, goal: Goal) => {
  const [lo, hi] = kcalBand(goal);
  return kcalGoal > 0 && kcal >= kcalGoal * lo && kcal <= kcalGoal * hi;
};

export const PROTEIN_OK_SHARE = 0.9;

export interface GameInput {
  /** all days with diary entries, any order */
  days: DayTotals[];
  /** dates of all measurements (weight and tape), duplicates allowed */
  measurementDates: string[];
  /** different foods ever logged */
  distinctFoods: number;
  customFoods: number;
  kcalGoal: number;
  proteinGoal: number;
  goal: Goal;
  today: string;
}

export interface Achievement {
  id: string;
  title: string;
  hint: string;
  value: number;
  target: number;
  done: boolean;
}

export interface Game {
  xp: number;
  level: number;
  /** XP at which this level started / the next one starts */
  levelFrom: number;
  levelTo: number;
  /** 0..4 — how grown the plant is */
  stage: number;
  stageTitle: string;
  /** consecutive logged days ending today or yesterday */
  streak: number;
  bestStreak: number;
  loggedDays: number;
  kcalDays: number;
  proteinDays: number;
  measureWeeks: number;
  today: { logged: boolean; kcal: boolean; protein: boolean; measuredThisWeek: boolean };
  achievements: Achievement[];
}

/** Level n starts at 50·n·(n−1) XP: 0, 100, 300, 600, 1000… */
export const levelStart = (level: number) => 50 * level * (level - 1);

export function levelFor(xp: number): number {
  let l = 1;
  while (levelStart(l + 1) <= xp) l++;
  return l;
}

export const STAGES = ['Семечко', 'Росток', 'Саженец', 'Деревце', 'Дерево с плодами'];
const STAGE_FROM_LEVEL = [1, 2, 4, 7, 11];

export const stageFor = (level: number) => STAGE_FROM_LEVEL.reduce((s, from, i) => (level >= from ? i : s), 0);

/** Level at which the next stage opens, or null on the last stage. */
export const nextStageLevel = (stage: number): number | null => STAGE_FROM_LEVEL[stage + 1] ?? null;

export function computeGame(g: GameInput): Game {
  const dates = new Set(g.days.map((d) => d.date));
  let kcalDays = 0;
  let proteinDays = 0;
  for (const d of g.days) {
    if (inKcalBand(d.kcal, g.kcalGoal, g.goal)) kcalDays++;
    if (g.proteinGoal > 0 && d.protein >= g.proteinGoal * PROTEIN_OK_SHARE) proteinDays++;
  }
  const weeks = new Set(g.measurementDates.map(weekStart));

  // current streak: today counts if logged, otherwise the run that ended yesterday is still alive
  let streak = 0;
  for (let d = dates.has(g.today) ? g.today : addDays(g.today, -1); dates.has(d); d = addDays(d, -1)) streak++;
  let bestStreak = 0;
  for (const d of dates) {
    if (dates.has(addDays(d, -1))) continue; // not the first day of a run
    let n = 0;
    for (let x = d; dates.has(x); x = addDays(x, 1)) n++;
    if (n > bestStreak) bestStreak = n;
  }

  const xp = dates.size * XP.logged + kcalDays * XP.kcal + proteinDays * XP.protein + weeks.size * XP.measureWeek;
  const level = levelFor(xp);
  const stage = stageFor(level);
  const t = g.days.find((d) => d.date === g.today);

  const a = (id: string, title: string, hint: string, value: number, target: number): Achievement => ({
    id, title, hint, value: Math.min(value, target), target, done: value >= target,
  });
  const achievements = [
    a('first', 'Начало', 'Первый день с записями', dates.size, 1),
    a('streak7', 'Неделя подряд', '7 дней с записями подряд', bestStreak, 7),
    a('streak30', 'Месяц подряд', '30 дней с записями подряд', bestStreak, 30),
    a('streak100', 'Сто дней подряд', '100 дней с записями подряд', bestStreak, 100),
    a('days100', 'Сотня', '100 дней с записями всего', dates.size, 100),
    a('kcal10', 'В норме', '10 дней в норме калорий', kcalDays, 10),
    a('kcal50', 'Стабильность', '50 дней в норме калорий', kcalDays, 50),
    a('protein7', 'Белок на месте', '7 дней с нормой белка', proteinDays, 7),
    a('protein30', 'Белковый месяц', '30 дней с нормой белка', proteinDays, 30),
    a('measure1', 'Первые замеры', 'Записать вес или объёмы', weeks.size, 1),
    a('measure8', 'Замеры по расписанию', '8 недель с замерами', weeks.size, 8),
    a('foods50', 'Разнообразие', '50 разных продуктов в дневнике', g.distinctFoods, 50),
    a('own', 'Свой рецепт', 'Создать свой продукт', g.customFoods, 1),
  ];

  return {
    xp, level, levelFrom: levelStart(level), levelTo: levelStart(level + 1), stage, stageTitle: STAGES[stage],
    streak, bestStreak, loggedDays: dates.size, kcalDays, proteinDays, measureWeeks: weeks.size,
    today: {
      logged: !!t,
      kcal: !!t && inKcalBand(t.kcal, g.kcalGoal, g.goal),
      protein: !!t && g.proteinGoal > 0 && t.protein >= g.proteinGoal * PROTEIN_OK_SHARE,
      measuredThisWeek: weeks.has(weekStart(g.today)),
    },
    achievements,
  };
}

/** «1 день», «3 дня», «7 дней» */
export function daysWord(n: number): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  const w = a > 10 && a < 20 ? 'дней' : b === 1 ? 'день' : b >= 2 && b <= 4 ? 'дня' : 'дней';
  return `${n} ${w}`;
}
