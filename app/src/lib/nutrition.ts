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

const DEFAULT_TITLES: Record<MealType, string> = { breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекусы' };

/** Own names of the four meals («Перекусы» → «Полдник»); empty or missing = the default. Loaded at startup by lib/app-state.tsx. */
export function setMealTitles(titles: Record<string, string> | null | undefined): void {
  for (const m of MEALS) m.title = titles?.[m.type]?.trim() || DEFAULT_TITLES[m.type];
}

/** Meal for «now», used when a screen is opened without one (the icon's quick actions). */
export function mealForNow(now: Date = new Date()): MealType {
  const h = now.getHours();
  return h >= 5 && h < 11 ? 'breakfast' : h >= 11 && h < 16 ? 'lunch' : h >= 18 && h < 22 ? 'dinner' : 'snack';
}

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

/** Who owns profile.kcal_goal: the Mifflin formula, the adaptive weekly check-in, or the user. */
export type KcalMode = 'formula' | 'adaptive' | 'manual';

/** Safe lower limit for a weight-loss goal; going below is only for supervised diets. */
export const kcalFloor = (sex: Sex) => (sex === 'male' ? 1500 : 1200);

export interface GoalExplain {
  age: number;
  bmr: number;
  factor: number;
  activityTitle: string;
  tdee: number;
  /** kcal per day from the pace (~7700 kcal per kg); negative for weight loss */
  delta: number;
  floor: number;
  floorApplied: boolean;
  kcal: number;
}

/** Step by step: BMR (Mifflin-St Jeor) × activity ± pace, with the floor for weight loss. */
export function explainGoal(b: BodyInput): GoalExplain {
  const age = ageFrom(b.birth_date);
  const base = bmr(b.sex, b.weight_kg, b.height_cm, age);
  const act = ACTIVITY_LEVELS.find((a) => a.value === b.activity_level) ?? ACTIVITY_LEVELS[0];
  const total = base * act.factor;
  const perDay = (b.pace_kg_week * 7700) / 7;
  const delta = b.goal === 'lose' ? -perDay : b.goal === 'gain' ? perDay : 0;
  const floor = kcalFloor(b.sex);
  const floorApplied = b.goal === 'lose' && total + delta < floor;
  const kcal = Math.round((floorApplied ? floor : total + delta) / 10) * 10;
  return { age, bmr: base, factor: act.factor, activityTitle: act.title, tdee: total, delta, floor, floorApplied, kcal };
}

export function dailyKcalGoal(b: BodyInput): number {
  return explainGoal(b).kcal;
}

/** Weekly pace as a percent of body weight. */
export function paceAsPctBW(paceKgWeek: number, weightKg: number): number {
  return weightKg > 0 ? (paceKgWeek / weightKg) * 100 : 0;
}

/** Neutral warnings for a pace above 1% of body weight a week, a deficit above 1000 kcal, or the floor. */
export function goalWarnings(b: BodyInput, e: GoalExplain = explainGoal(b)): string[] {
  const out: string[] = [];
  if (b.goal === 'maintain') return out;
  if (paceAsPctBW(b.pace_kg_week, b.weight_kg) > 1)
    out.push(`Темп больше 1% веса в неделю (${fmt(paceAsPctBW(b.pace_kg_week, b.weight_kg), 1)}%). Обычно советуют 0,5–1%: так легче удержать результат.`);
  if (b.goal === 'lose' && -e.delta > 1000) out.push(`Дефицит больше 1000 ккал в день. Обычно советуют 500–700 ккал.`);
  if (e.floorApplied)
    out.push(`Норма упирается в нижний порог ${fmt(e.floor)} ккал, поэтому похудение пойдёт медленнее. Ниже — только под наблюдением врача.`);
  return out;
}

export function macroGrams(kcal: number, proteinPct: number, fatPct: number, carbsPct: number) {
  return {
    protein: Math.round((kcal * proteinPct) / 100 / 4),
    fat: Math.round((kcal * fatPct) / 100 / 9),
    carbs: Math.round((kcal * carbsPct) / 100 / 4),
  };
}

/** Weight used for the g/kg protein goal: actual trend weight, or the weight at BMI 27 when BMI >= 30. */
export type ProteinRef = 'adjusted' | 'actual';

/** Presets for the g/kg protein goal (ISSN 2026: 1.2–1.6 for everyone, 1.6–2.2 with strength training). */
export const PROTEIN_GKG_PRESETS = [1.2, 1.6, 2.0, 2.2];
/** Our design choice for BMI >= 30: count protein from the weight at BMI 27 (the ISSN stand uses body weight). */
export const PROTEIN_REF_BMI = 27;
/** Per-meal protein below this is marked in the diary (ISSN 2017: ~20–40 g per meal). */
export const PROTEIN_MEAL_MIN_G = 20;
/** Fat never goes below 20% of kcal in the g/kg mode (Helms 2014: 15–30%). */
const FAT_MIN_SHARE = 0.2;
/** Protein falls back to this g/kg first when the kcal do not fit. */
const PROTEIN_GKG_FALLBACK = 1.2;

export function proteinRefWeight(weightKg: number, heightCm: number, ref: ProteinRef | null | undefined): { kg: number; adjusted: boolean } {
  const m = heightCm / 100;
  if (ref !== 'actual' && m > 0 && bmi(weightKg, heightCm) >= 30) return { kg: PROTEIN_REF_BMI * m * m, adjusted: true };
  return { kg: weightKg, adjusted: false };
}

/** Protein = g/kg × weight, fat = max(fat %, 20% of kcal), carbs take the rest; if the rest is negative, protein drops to 1.2 g/kg first. */
export function gkgMacros(kcal: number, gkg: number, refKg: number, fatPct: number) {
  const fat = Math.max((kcal * fatPct) / 100 / 9, (FAT_MIN_SHARE * kcal) / 9);
  let protein = gkg * refKg;
  let carbs = (kcal - protein * 4 - fat * 9) / 4;
  if (carbs < 0) {
    protein = Math.min(protein, PROTEIN_GKG_FALLBACK * refKg);
    carbs = (kcal - protein * 4 - fat * 9) / 4;
  }
  if (carbs < 0) {
    protein = Math.max(0, (kcal - fat * 9) / 4);
    carbs = 0;
  }
  return { protein: Math.round(protein), fat: Math.round(fat), carbs: Math.round(carbs) };
}

/**
 * Daily macro targets in grams: g/kg protein first, then fixed grams if the user set them, else the percentages.
 * `weightKg` is the trend weight; without it the profile's start weight is used.
 */
export function macroTargets(
  p: {
    kcal_goal: number; protein_pct: number; fat_pct: number; carbs_pct: number;
    protein_g?: number | null; fat_g?: number | null; carbs_g?: number | null;
    protein_gkg?: number | null; protein_ref?: ProteinRef | null; height_cm?: number; start_weight_kg?: number;
  },
  weightKg?: number,
) {
  const w = weightKg ?? p.start_weight_kg;
  if (p.protein_gkg != null && w != null && w > 0 && p.height_cm != null)
    return gkgMacros(p.kcal_goal, p.protein_gkg, proteinRefWeight(w, p.height_cm, p.protein_ref).kg, p.fat_pct);
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

export type KcalCheck =
  /** kcal on the label differ from 4P+9F+4C by more than 15% */
  | { kind: 'mismatch'; est: number; kcal: number }
  /** carbs look like US "total carbohydrate" (fiber included): subtracting fiber explains the kcal */
  | { kind: 'carbs_include_fiber'; est: number; kcal: number; carbs: number };

// Polyols (~2.4 kcal/g) and alcohol (7 kcal/g) break the 4/9/4 rule, so such products are not checked.
// No \b: it does not work after Cyrillic letters.
const NO_CHECK_NAME =
  /без сахара|подсластит|сахарозамен|sugar[ -]?free|пиво|вино(?![а-яё])|водк|коньяк|виски|ликёр|ликер|сидр|настойк|бальзам|шампанск|(?:^|[^а-яё])ром(?![а-яё])|beer|wine|vodka|whisk|cider|liqueur|rum\b/i;
const KCAL_TOLERANCE = 0.15;
const KCAL_CHECK_MIN = 40;

/**
 * Does the label kcal agree with the macros (per 100 g)? Null when it does or when the rule does not apply
 * (kcal < 40, alcohol, sweeteners, macros missing). Estimate: 4P + 9F + 4C, plus fiber at 2 kcal/g (EU labels
 * list fiber apart from carbs). If fiber > 0 and 4P + 9F + 4(C − fiber) + 2·fiber is clearly closer, the carbs
 * probably include fiber (US/CA labels; OFF keeps whatever the label said, so the barcode prefix is not used).
 */
export function kcalCheck(f: {
  name?: string | null;
  category?: string | null;
  kcal: number;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  fiber?: number | null;
}): KcalCheck | null {
  const { kcal } = f;
  if (!(kcal >= KCAL_CHECK_MIN)) return null;
  if (f.protein == null || f.fat == null || f.carbs == null) return null;
  if (f.category === 'alcohol' || NO_CHECK_NAME.test(f.name ?? '')) return null;
  const fib = f.fiber != null && f.fiber > 0 ? Math.min(f.fiber, f.carbs) : 0;
  const base = 4 * f.protein + 9 * f.fat;
  const est = base + 4 * f.carbs + 2 * fib;
  const off = Math.abs(kcal - est);
  if (off / kcal <= KCAL_TOLERANCE) return null;
  if (fib > 0) {
    const estUs = base + 4 * (f.carbs - fib) + 2 * fib;
    const offUs = Math.abs(kcal - estUs);
    if (offUs / kcal <= KCAL_TOLERANCE && offUs < off / 2)
      return { kind: 'carbs_include_fiber', est: Math.round(est), kcal, carbs: round1(f.carbs - fib) };
  }
  return { kind: 'mismatch', est: Math.round(est), kcal };
}

/** Neutral hint for the product card and the edit form. */
export function kcalCheckText(c: KcalCheck): string {
  const base = `По составу ≈ ${fmt(c.est)} ккал, указано ${fmt(c.kcal)}.`;
  return c.kind === 'carbs_include_fiber'
    ? `${base} Похоже, углеводы указаны вместе с клетчаткой (американский формат).`
    : `${base} Проверьте значения на упаковке.`;
}
