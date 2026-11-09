// Daily norms for adults (18+) from МР 2.3.1.0253-21 «Нормы физиологических потребностей в энергии и пищевых
// веществах для различных групп населения Российской Федерации».
// Men: table 11 (vitamins), table 12 (minerals), table 9 (fiber), table 10 (added sugar, fats).
// Women: table 16 (vitamins), table 17 (minerals), table 14 (fiber), table 15 (added sugar, fats).
// The MR gives one adult column («старше 18 лет»); the only age split is vitamin D and calcium from 65 years.
// Pregnancy and lactation (tables 19-20) are not modelled.
import type { NutrientKey } from '@/lib/micros';

/** [from age, value] pairs, ascending by age. */
export type ByAge = [number, number][];
export type SexNorm = number | ByAge;
export type Norm = SexNorm | { male: SexNorm; female: SexNorm };

/**
 * Fixed norms. added_sugar and sat_fat are not here: they are a share of the kcal goal (see dvFor in lib/micros).
 * Limits (na, sugar, chol) are upper values, not needs.
 */
export const NORMS: Partial<Record<NutrientKey, Norm>> = {
  vit_a: { male: 900, female: 800 }, // мкг РЭ
  vit_c: 100,
  vit_d: [[18, 15], [65, 20]], // мкг; «для лиц старше 65 лет — 20 мкг»
  vit_e: 15,
  vit_k: 120,
  b1: 1.5,
  b2: 1.8,
  b3: 20,
  b6: 2,
  b9: 400,
  b12: 3,
  ca: [[18, 1000], [65, 1200]],
  fe: { male: 10, female: 18 },
  mg: 420,
  p: 700,
  k: 3500,
  zn: 12,
  se: { male: 70, female: 55 },
  na: 2000, // need is 1300 mg; the MR says not more than 2 g per day, used as the limit
  fiber: 25, // MR: 20-25 g per day; the upper value is the target
  sugar: 90, // not in the MR: EU reference intake for total sugars, kept as a soft limit
  chol: 300, // not in the MR for adults (only for children 11-17): common upper value
};

/** Added sugar: below 10% of energy, about 5% with overweight or obesity (tables 10 and 15). */
export const ADDED_SUGAR_SHARE = 0.1;
export const ADDED_SUGAR_SHARE_OVERWEIGHT = 0.05;
/** Saturated fat: 10% of energy (tables 10 and 15). */
export const SAT_FAT_SHARE = 0.1;
