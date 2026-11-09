import { ageFrom } from './dates';

export type Sex = 'male' | 'female';
export type Goal = 'lose' | 'maintain' | 'gain';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEALS: { type: MealType; title: string }[] = [
  { type: 'breakfast', title: 'Завтрак' },
  { type: 'lunch', title: 'Обед' },
  { type: 'dinner', title: 'Ужин' },
  { type: 'snack', title: 'Перекусы' },
];

export const mealTitle = (t: MealType) => MEALS.find((m) => m.type === t)?.title ?? t;

export const ACTIVITY_LEVELS: { value: ActivityLevel; title: string; hint: string; factor: number }[] = [
  { value: 'sedentary', title: 'Минимальная', hint: 'Сидячая работа, почти без спорта', factor: 1.2 },
  { value: 'light', title: 'Низкая', hint: 'Лёгкие тренировки 1–3 раза в неделю', factor: 1.375 },
  { value: 'moderate', title: 'Средняя', hint: 'Тренировки 3–5 раз в неделю', factor: 1.55 },
  { value: 'active', title: 'Высокая', hint: 'Тренировки 6–7 раз в неделю', factor: 1.725 },
  { value: 'very_active', title: 'Очень высокая', hint: 'Физическая работа и спорт', factor: 1.9 },
];

export const GOALS: { value: Goal; title: string }[] = [
  { value: 'lose', title: 'Похудеть' },
  { value: 'maintain', title: 'Держать вес' },
  { value: 'gain', title: 'Набрать вес' },
];

export interface BodyInput {
  sex: Sex;
  birth_date: string;
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  goal: Goal;
  pace_kg_week: number;
}

/** Mifflin-St Jeor */
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

export function tdee(b: BodyInput): number {
  const f = ACTIVITY_LEVELS.find((a) => a.value === b.activity_level)?.factor ?? 1.2;
  return bmr(b.sex, b.weight_kg, b.height_cm, ageFrom(b.birth_date)) * f;
}

/** ~7700 kcal per kg of body fat */
export function dailyKcalGoal(b: BodyInput): number {
  const base = tdee(b);
  const delta = (b.pace_kg_week * 7700) / 7;
  let kcal = base;
  if (b.goal === 'lose') kcal = Math.max(base - delta, b.sex === 'male' ? 1500 : 1200);
  if (b.goal === 'gain') kcal = base + delta;
  return Math.round(kcal / 10) * 10;
}

export function macroGrams(kcal: number, proteinPct: number, fatPct: number, carbsPct: number) {
  return {
    protein: Math.round((kcal * proteinPct) / 100 / 4),
    fat: Math.round((kcal * fatPct) / 100 / 9),
    carbs: Math.round((kcal * carbsPct) / 100 / 4),
  };
}

/** Daily macro targets in grams: fixed grams if the user set them, else from the percentages. */
export function macroTargets(p: {
  kcal_goal: number; protein_pct: number; fat_pct: number; carbs_pct: number;
  protein_g?: number | null; fat_g?: number | null; carbs_g?: number | null;
}) {
  if (p.protein_g != null && p.fat_g != null && p.carbs_g != null)
    return { protein: Math.round(p.protein_g), fat: Math.round(p.fat_g), carbs: Math.round(p.carbs_g) };
  return macroGrams(p.kcal_goal, p.protein_pct, p.fat_pct, p.carbs_pct);
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function fmt(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

/** Parse user input that may use a comma as decimal separator. */
export function parseNum(s: string): number | null {
  const v = parseFloat(s.replace(',', '.').replace(/\s/g, ''));
  return Number.isFinite(v) ? v : null;
}
