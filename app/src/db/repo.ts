import type { SQLiteDatabase } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { nowIso } from '@/lib/dates';
import type { ActivityLevel, Goal, KcalMode, MealType, ProteinRef, Sex } from '@/lib/nutrition';
import type { MeasurementType } from '@/lib/measurements';
import { addMicros, microsPer100, scaleMicros, type Micros } from '@/lib/micros';
import { weightTrend, type WeightTrend } from '@/lib/trend';
import type { Serving } from '@/data/basic-foods';

export type { Serving };
export const uuid = () => randomUUID();

// ---------- types ----------

export interface Profile {
  sex: Sex;
  birth_date: string;
  height_cm: number;
  start_weight_kg: number;
  target_weight_kg: number;
  activity_level: ActivityLevel;
  goal: Goal;
  pace_kg_week: number;
  kcal_goal: number;
  /** legacy flag, saved as kcal_mode !== 'manual'; use kcal_mode */
  kcal_auto: number;
  /** who owns kcal_goal: 'formula' recalculates by trend weight, 'adaptive' is the weekly check-in, 'manual' is the user */
  kcal_mode: KcalMode;
  protein_pct: number;
  fat_pct: number;
  carbs_pct: number;
  water_goal_ml: number;
  glass_ml: number;
  /** fixed goals in grams; when all three are set they win over the percentages */
  protein_g?: number | null;
  fat_g?: number | null;
  carbs_g?: number | null;
  /** protein goal in g per kg of weight; when set it wins over protein_g/fat_g/carbs_g and protein_pct */
  protein_gkg?: number | null;
  /** weight for protein_gkg: 'adjusted' = weight at BMI 27 when BMI >= 30, 'actual' = trend weight */
  protein_ref?: ProteinRef | null;
}

export interface FoodRow {
  id: string;
  source: 'builtin' | 'off' | 'custom';
  barcode: string | null;
  name: string;
  brand: string | null;
  kcal: number;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  sugar: number | null;
  fiber: number | null;
  salt: number | null;
  servings: string;
  favourite: number;
  last_used_at: string | null;
  category: string | null;
  /** JSON Micros per 100 g from the product label (Open Food Facts); missing keys are estimated */
  micros: string | null;
  /** 1 = the user corrected this builtin / OFF product; Open Food Facts data never overwrites it */
  edited: number;
  /** set on the hidden food of a home-made dish weighed after cooking (see saveMeal) */
  meal_id?: string | null;
  /** total grams of the last diary entry of this food; null = never logged */
  last_grams?: number | null;
  /** serving name of that entry (Serving.name); null = it was logged in grams */
  last_serving?: string | null;
}

export type FoodInput = Omit<FoodRow, 'id' | 'favourite' | 'last_used_at' | 'servings' | 'category' | 'micros' | 'edited' | 'last_grams' | 'last_serving' | 'meal_id'> & {
  servings: Serving[];
  category?: string | null;
  micros?: string | null;
  /** 1 marks a user correction; omitted keeps the stored flag */
  edited?: number;
};

export interface Entry {
  id: string;
  date: string;
  meal_type: MealType;
  food_id: string | null;
  name: string;
  grams: number | null;
  serving_label: string | null;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface MeasurementRow { id: string; date: string; type: MeasurementType; value: number }
export interface MealRow { id: string; name: string; items: number; kcal: number; /** net weight of the cooked dish, null = logged by ingredients */ cooked_weight_g: number | null }

/** Id of the hidden food row that stands for a dish weighed after cooking. */
export const mealFoodId = (mealId: string) => `meal-${mealId}`;
export interface MealItemRow { id: string; meal_id: string; food_id: string; grams: number; name: string; kcal: number; protein: number | null; fat: number | null; carbs: number | null }

export const servingsOf = (f: Pick<FoodRow, 'servings'>): Serving[] => {
  try {
    return JSON.parse(f.servings) as Serving[];
  } catch {
    return [];
  }
};

/** Nutrients of `grams` of a food (values in the row are per 100 g). */
export function portion(f: Pick<FoodRow, 'kcal' | 'protein' | 'fat' | 'carbs'>, grams: number) {
  const k = grams / 100;
  return { kcal: f.kcal * k, protein: (f.protein ?? 0) * k, fat: (f.fat ?? 0) * k, carbs: (f.carbs ?? 0) * k };
}

/** A whole pack bigger than this (900 ml milk, 1 kg cereal) is never the default portion. */
const MAX_DEFAULT_PACK_G = 250;

/** Serving name from a diary serving label «2 порция (30 g)» → «порция (30 g)»; null for grams. */
export function servingNameOf(label: string | null): string | null {
  const m = label ? /^([\d.,]+)\s+(.+)$/.exec(label) : null;
  return m ? m[2] : null;
}

/** «1,5» style amount: at most 2 decimals, comma separator. */
const amountText = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');

export interface DefaultPortion {
  /** null = grams */
  unit: Serving | null;
  /** text for the amount field, in `unit` (or grams) */
  amount: string;
  grams: number;
  /** label for the diary entry, null when in grams */
  label: string | null;
  /** true = repeats the last diary entry of this food */
  last: boolean;
}

/**
 * Portion a food opens with: the last logged portion, else «порция», else a pack of at most 250 g,
 * else another named serving (шт, стакан…), else 100 g.
 */
export function defaultPortion(f: Pick<FoodRow, 'servings' | 'last_grams' | 'last_serving'>): DefaultPortion {
  const sv = servingsOf(f);
  if (f.last_grams != null && f.last_grams > 0) {
    const s = f.last_serving ? sv.find((x) => x.name === f.last_serving && x.grams > 0) : undefined;
    if (s) {
      const amount = amountText(f.last_grams / s.grams);
      return { unit: s, amount, grams: f.last_grams, label: `${amount} ${s.name}`, last: true };
    }
    return { unit: null, amount: amountText(f.last_grams), grams: f.last_grams, label: null, last: true };
  }
  const isPack = (s: Serving) => s.name.startsWith('упаковка');
  const s =
    sv.find((x) => x.name.startsWith('порция')) ??
    sv.find((x) => isPack(x) && x.grams <= MAX_DEFAULT_PACK_G) ??
    sv.find((x) => !isPack(x));
  if (s && s.grams > 0) return { unit: s, amount: '1', grams: s.grams, label: `1 ${s.name}`, last: false };
  return { unit: null, amount: '100', grams: 100, label: null, last: false };
}

// ---------- profile & settings ----------

export async function getProfile(db: SQLiteDatabase): Promise<Profile | null> {
  return db.getFirstAsync<Profile>('select * from profile where id = 1');
}

export async function saveProfile(db: SQLiteDatabase, p: Profile): Promise<void> {
  const now = nowIso();
  await db.runAsync(
    `insert into profile (id, sex, birth_date, height_cm, start_weight_kg, target_weight_kg, activity_level, goal,
       pace_kg_week, kcal_goal, kcal_auto, kcal_mode, protein_pct, fat_pct, carbs_pct, water_goal_ml, glass_ml, protein_g, fat_g, carbs_g, protein_gkg, protein_ref, created_at, updated_at)
     values (1, $sex, $birth, $h, $sw, $tw, $al, $goal, $pace, $kcal, $auto, $mode, $p, $f, $c, $water, $glass, $pg, $fg, $cg, $gkg, $pref, $now, $now)
     on conflict(id) do update set sex=$sex, birth_date=$birth, height_cm=$h, start_weight_kg=$sw, target_weight_kg=$tw,
       activity_level=$al, goal=$goal, pace_kg_week=$pace, kcal_goal=$kcal, kcal_auto=$auto, kcal_mode=$mode, protein_pct=$p, fat_pct=$f,
       carbs_pct=$c, water_goal_ml=$water, glass_ml=$glass, protein_g=$pg, fat_g=$fg, carbs_g=$cg, protein_gkg=$gkg, protein_ref=$pref, updated_at=$now`,
    {
      $sex: p.sex, $birth: p.birth_date, $h: p.height_cm, $sw: p.start_weight_kg, $tw: p.target_weight_kg,
      $al: p.activity_level, $goal: p.goal, $pace: p.pace_kg_week, $kcal: p.kcal_goal, $auto: p.kcal_mode === 'manual' ? 0 : 1, $mode: p.kcal_mode,
      $p: p.protein_pct, $f: p.fat_pct, $c: p.carbs_pct, $water: p.water_goal_ml, $glass: p.glass_ml, $pg: p.protein_g ?? null, $fg: p.fat_g ?? null, $cg: p.carbs_g ?? null,
      $gkg: p.protein_gkg ?? null, $pref: p.protein_ref === 'actual' ? 'actual' : 'adjusted', $now: now,
    },
  );
}

export async function getSetting<T>(db: SQLiteDatabase, key: string, fallback: T): Promise<T> {
  const row = await db.getFirstAsync<{ value: string }>('select value from settings where key = ?', key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(db: SQLiteDatabase, key: string, value: unknown): Promise<void> {
  await db.runAsync(
    'insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value',
    key,
    JSON.stringify(value),
  );
}

// ---------- foods ----------

export async function searchFoods(db: SQLiteDatabase, q: string, limit = 50): Promise<FoodRow[]> {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  // SQLite's lower() is ASCII-only, so match Cyrillic case-insensitively in JS.
  const like = `%${words[0].slice(0, 3)}%`;
  const rows = await db.getAllAsync<FoodRow>(
    `select * from foods where deleted = 0 and (name like ? or lower(name) like ? or name like ? or brand like ? or barcode = ?)
     order by use_count desc, last_used_at desc limit 2000`,
    like,
    like,
    `%${capitalize(words[0].slice(0, 3))}%`,
    like,
    q.trim(),
  );
  const scored = rows
    .map((r) => {
      const hay = `${r.name} ${r.brand ?? ''}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return null;
      const name = r.name.toLowerCase();
      let score = 0;
      if (name.startsWith(words[0])) score += 10;
      if (r.source !== 'off') score += 3;
      if (/[а-яё]/i.test(r.name)) score += 2;
      score += Math.min((r as FoodRow & { use_count?: number }).use_count ?? 0, 20);
      score -= name.length / 40;
      return { r, score };
    })
    .filter((x): x is { r: FoodRow; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.r);
  return scored;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export async function recentFoods(db: SQLiteDatabase, limit = 40): Promise<FoodRow[]> {
  return db.getAllAsync<FoodRow>(
    'select * from foods where deleted = 0 and last_used_at is not null order by last_used_at desc limit ?',
    limit,
  );
}

export async function favouriteFoods(db: SQLiteDatabase): Promise<FoodRow[]> {
  return db.getAllAsync<FoodRow>('select * from foods where deleted = 0 and favourite = 1 order by name');
}

export async function customFoods(db: SQLiteDatabase): Promise<FoodRow[]> {
  return db.getAllAsync<FoodRow>("select * from foods where deleted = 0 and source = 'custom' and meal_id is null order by name");
}

export async function getFood(db: SQLiteDatabase, id: string): Promise<FoodRow | null> {
  return db.getFirstAsync<FoodRow>('select * from foods where id = ?', id);
}

/** A built-in food by its exact name (used for the «сухая / варёная» pairs). */
export async function getBuiltinByName(db: SQLiteDatabase, name: string): Promise<FoodRow | null> {
  return db.getFirstAsync<FoodRow>("select * from foods where source = 'builtin' and deleted = 0 and name = ?", name);
}

export async function getFoodByBarcode(db: SQLiteDatabase, code: string): Promise<FoodRow | null> {
  return db.getFirstAsync<FoodRow>('select * from foods where barcode = ? and deleted = 0', code);
}

export async function saveFood(db: SQLiteDatabase, f: FoodInput, id?: string): Promise<string> {
  const now = nowIso();
  const existingByBarcode =
    !id && f.barcode ? await db.getFirstAsync<FoodRow & { deleted: number }>('select * from foods where barcode = ?', f.barcode) : null;
  if (existingByBarcode && (existingByBarcode.source === 'custom' || existingByBarcode.edited === 1) && f.source === 'off') {
    // the user's own or corrected product wins over Open Food Facts data
    if (existingByBarcode.deleted) await db.runAsync('update foods set deleted = 0 where id = ?', existingByBarcode.id);
    return existingByBarcode.id;
  }
  const theId = id ?? existingByBarcode?.id ?? uuid();
  await db.runAsync(
    `insert into foods (id, source, barcode, name, brand, kcal, protein, fat, carbs, sugar, fiber, salt, servings, category, micros, edited, created_at, updated_at)
     values ($id, $source, $barcode, $name, $brand, $kcal, $p, $f, $c, $sugar, $fiber, $salt, $servings, $cat, $micros, coalesce($edited, 0), $now, $now)
     on conflict(id) do update set source=$source, barcode=$barcode, name=$name, brand=$brand, kcal=$kcal, protein=$p, fat=$f,
       carbs=$c, sugar=$sugar, fiber=$fiber, salt=$salt, servings=$servings, category=$cat, micros=$micros,
       edited=coalesce($edited, edited), deleted=0, updated_at=$now`,
    {
      $id: theId, $source: f.source, $barcode: f.barcode || null, $name: f.name, $brand: f.brand || null,
      $kcal: f.kcal, $p: f.protein, $f: f.fat, $c: f.carbs, $sugar: f.sugar, $fiber: f.fiber, $salt: f.salt,
      $servings: JSON.stringify(f.servings), $cat: f.category ?? null, $micros: f.micros ?? null, $edited: f.edited ?? null, $now: now,
    },
  );
  return theId;
}

export async function deleteFood(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('update foods set deleted = 1, favourite = 0 where id = ?', id);
}

export async function toggleFavourite(db: SQLiteDatabase, id: string): Promise<boolean> {
  await db.runAsync('update foods set favourite = 1 - favourite where id = ?', id);
  const r = await db.getFirstAsync<{ favourite: number }>('select favourite from foods where id = ?', id);
  return r?.favourite === 1;
}

async function markUsed(db: SQLiteDatabase, foodId: string, grams: number, servingLabel: string | null) {
  await db.runAsync(
    'update foods set last_used_at = ?, use_count = use_count + 1, last_grams = ?, last_serving = ? where id = ?',
    nowIso(), grams, servingNameOf(servingLabel), foodId,
  );
}

// ---------- diary ----------

export async function addFoodEntry(
  db: SQLiteDatabase,
  date: string,
  meal: MealType,
  food: FoodRow,
  grams: number,
  servingLabel: string | null,
): Promise<string> {
  const n = portion(food, grams);
  const now = nowIso();
  const id = uuid();
  await db.runAsync(
    `insert into diary_entries (id, date, meal_type, food_id, name, grams, serving_label, kcal, protein, fat, carbs, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, date, meal, food.id, food.brand ? `${food.name} (${food.brand})` : food.name, grams, servingLabel,
    n.kcal, n.protein, n.fat, n.carbs, now, now,
  );
  await markUsed(db, food.id, grams, servingLabel);
  return id;
}

export async function addQuickEntry(
  db: SQLiteDatabase,
  date: string,
  meal: MealType,
  name: string,
  v: { kcal: number; protein: number; fat: number; carbs: number },
): Promise<string> {
  const now = nowIso();
  const id = uuid();
  await db.runAsync(
    `insert into diary_entries (id, date, meal_type, food_id, name, grams, serving_label, kcal, protein, fat, carbs, created_at, updated_at)
     values (?, ?, ?, null, ?, null, null, ?, ?, ?, ?, ?, ?)`,
    id, date, meal, name, v.kcal, v.protein, v.fat, v.carbs, now, now,
  );
  return id;
}

export async function getEntry(db: SQLiteDatabase, id: string): Promise<Entry | null> {
  return db.getFirstAsync<Entry>('select * from diary_entries where id = ?', id);
}

/** Re-scale an entry to a new weight; works even if the food was deleted. */
export async function updateEntryGrams(db: SQLiteDatabase, e: Entry, grams: number, servingLabel: string | null, meal: MealType) {
  const k = e.grams ? grams / e.grams : 1;
  await db.runAsync(
    `update diary_entries set grams = ?, serving_label = ?, meal_type = ?, kcal = ?, protein = ?, fat = ?, carbs = ?, updated_at = ? where id = ?`,
    grams, servingLabel, meal, e.kcal * k, e.protein * k, e.fat * k, e.carbs * k, nowIso(), e.id,
  );
  if (e.food_id) {
    // only the newest entry of the food defines its "last portion"; editing an older one must not overwrite it
    await db.runAsync(
      `update foods set last_grams = ?, last_serving = ? where id = ?
         and not exists (
           select 1 from diary_entries o, diary_entries me
            where me.id = ? and o.food_id = foods.id and o.id != me.id and o.created_at > me.created_at
         )`,
      grams, servingNameOf(servingLabel), e.food_id, e.id,
    );
  }
}

/** Usage fields of a food as they were before an add, so the toast's undo can put them back. */
export interface FoodUsage { id: string; last_used_at: string | null; use_count: number; last_grams: number | null; last_serving: string | null }

export async function foodUsage(db: SQLiteDatabase, foodId: string): Promise<FoodUsage | null> {
  return db.getFirstAsync<FoodUsage>('select id, last_used_at, use_count, last_grams, last_serving from foods where id = ?', foodId);
}

/**
 * Undo of a just-added food entry: deletes the row and rolls back what markUsed wrote.
 * If the same food was logged again after this entry, its newer usage is kept and only use_count drops.
 */
export async function undoFoodEntry(db: SQLiteDatabase, entryId: string, prev: FoodUsage | null) {
  const e = await db.getFirstAsync<{ food_id: string | null; created_at: string }>('select food_id, created_at from diary_entries where id = ?', entryId);
  await deleteEntry(db, entryId);
  if (!e?.food_id || !prev || prev.id !== e.food_id) return;
  const newer = await db.getFirstAsync<{ n: number }>(
    'select count(*) as n from diary_entries where food_id = ? and created_at > ?',
    e.food_id, e.created_at,
  );
  if (newer && newer.n > 0) {
    await db.runAsync('update foods set use_count = max(use_count - 1, 0) where id = ?', e.food_id);
    return;
  }
  await db.runAsync(
    'update foods set last_used_at = ?, use_count = max(use_count - 1, 0), last_grams = ?, last_serving = ? where id = ?',
    prev.last_used_at, prev.last_grams, prev.last_serving, e.food_id,
  );
}

export async function updateQuickEntry(db: SQLiteDatabase, id: string, meal: MealType, name: string, v: { kcal: number; protein: number; fat: number; carbs: number }) {
  await db.runAsync(
    'update diary_entries set meal_type = ?, name = ?, kcal = ?, protein = ?, fat = ?, carbs = ?, updated_at = ? where id = ?',
    meal, name, v.kcal, v.protein, v.fat, v.carbs, nowIso(), id,
  );
}

export async function deleteEntry(db: SQLiteDatabase, id: string) {
  await db.runAsync('delete from diary_entries where id = ?', id);
}

/** Undo of a delete: puts the same row back with its id and original order (created_at). */
export async function restoreEntry(db: SQLiteDatabase, e: Entry & { created_at?: string; updated_at?: string }) {
  const now = nowIso();
  const foodId = e.food_id ? ((await db.getFirstAsync<{ id: string }>('select id from foods where id = ?', e.food_id))?.id ?? null) : null;
  await db.runAsync(
    `insert or ignore into diary_entries (id, date, meal_type, food_id, name, grams, serving_label, kcal, protein, fat, carbs, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    e.id, e.date, e.meal_type, foodId, e.name, e.grams, e.serving_label, e.kcal, e.protein, e.fat, e.carbs, e.created_at ?? now, now,
  );
}

export async function entriesForDate(db: SQLiteDatabase, date: string): Promise<Entry[]> {
  return db.getAllAsync<Entry>('select * from diary_entries where date = ? order by created_at', date);
}

export async function entriesBetween(db: SQLiteDatabase, from: string, to: string): Promise<Entry[]> {
  return db.getAllAsync<Entry>('select * from diary_entries where date between ? and ? order by date, created_at', from, to);
}

export async function copyMeal(db: SQLiteDatabase, fromDate: string, meal: MealType, toDate: string, toMeal: MealType = meal) {
  const rows = await db.getAllAsync<Entry>('select * from diary_entries where date = ? and meal_type = ?', fromDate, meal);
  const now = nowIso();
  for (const e of rows) {
    await db.runAsync(
      `insert into diary_entries (id, date, meal_type, food_id, name, grams, serving_label, kcal, protein, fat, carbs, created_at, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      uuid(), toDate, toMeal, e.food_id, e.name, e.grams, e.serving_label, e.kcal, e.protein, e.fat, e.carbs, now, now,
    );
  }
  return rows.length;
}

export async function clearMeal(db: SQLiteDatabase, date: string, meal: MealType) {
  await db.runAsync('delete from diary_entries where date = ? and meal_type = ?', date, meal);
}

export interface DayTotals { date: string; kcal: number; protein: number; fat: number; carbs: number }

export async function dailyTotals(db: SQLiteDatabase, from: string, to: string): Promise<DayTotals[]> {
  return db.getAllAsync<DayTotals>(
    `select date, sum(kcal) as kcal, sum(protein) as protein, sum(fat) as fat, sum(carbs) as carbs
     from diary_entries where date between ? and ? group by date order by date`,
    from,
    to,
  );
}

/** Raw material for levels and achievements (see lib/game.ts). */
export async function gameData(db: SQLiteDatabase, today: string) {
  const [days, ms, foods, custom] = await Promise.all([
    dailyTotals(db, '0000-01-01', today),
    db.getAllAsync<{ date: string }>('select distinct date from measurements where date <= ?', today),
    db.getFirstAsync<{ n: number }>('select count(distinct food_id) as n from diary_entries where food_id is not null'),
    db.getFirstAsync<{ n: number }>("select count(*) as n from foods where deleted = 0 and source = 'custom'"),
  ]);
  return { days, measurementDates: ms.map((m) => m.date), distinctFoods: foods?.n ?? 0, customFoods: custom?.n ?? 0 };
}

/** kcal by meal type over a period. */
export async function mealKcal(db: SQLiteDatabase, from: string, to: string) {
  return db.getAllAsync<{ meal_type: MealType; kcal: number }>(
    'select meal_type, sum(kcal) as kcal from diary_entries where date between ? and ? group by meal_type',
    from,
    to,
  );
}

/** Diary names that gave the most kcal over a period. */
export async function topKcalFoods(db: SQLiteDatabase, from: string, to: string, limit = 3) {
  return db.getAllAsync<{ name: string; kcal: number; times: number }>(
    'select name, sum(kcal) as kcal, count(*) as times from diary_entries where date between ? and ? group by name order by kcal desc limit ?',
    from,
    to,
    limit,
  );
}

export async function datesWithEntries(db: SQLiteDatabase, from: string, to: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ date: string }>('select distinct date from diary_entries where date between ? and ?', from, to);
  return new Set(rows.map((r) => r.date));
}

// ---------- meals (own dishes) ----------

export async function listMeals(db: SQLiteDatabase): Promise<MealRow[]> {
  return db.getAllAsync<MealRow>(
    `select m.id, m.name, m.cooked_weight_g, count(i.id) as items, coalesce(sum(f.kcal * i.grams / 100), 0) as kcal
     from meals m left join meal_items i on i.meal_id = m.id left join foods f on f.id = i.food_id
     group by m.id order by m.name`,
  );
}

export async function getMeal(db: SQLiteDatabase, id: string) {
  const meal = await db.getFirstAsync<{ id: string; name: string; cooked_weight_g: number | null }>('select id, name, cooked_weight_g from meals where id = ?', id);
  const items = await db.getAllAsync<MealItemRow>(
    `select i.id, i.meal_id, i.food_id, i.grams, f.name, f.kcal, f.protein, f.fat, f.carbs
     from meal_items i join foods f on f.id = i.food_id where i.meal_id = ? order by rowid`,
    id,
  );
  return meal ? { ...meal, items } : null;
}

/**
 * `cookedWeight` = net grams of the ready dish (pot subtracted). With it the dish also becomes a food
 * («350 г борща»): a hidden row with КБЖУ and micronutrients per 100 g of the cooked weight, summed from the ingredients.
 */
export async function saveMeal(
  db: SQLiteDatabase,
  id: string | null,
  name: string,
  items: { food_id: string; grams: number }[],
  cookedWeight: number | null = null,
) {
  const theId = id ?? uuid();
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `insert into meals (id, name, cooked_weight_g, created_at, updated_at) values (?, ?, ?, ?, ?)
       on conflict(id) do update set name = excluded.name, cooked_weight_g = excluded.cooked_weight_g, updated_at = excluded.updated_at`,
      theId, name, cookedWeight, now, now,
    );
    await db.runAsync('delete from meal_items where meal_id = ?', theId);
    for (const it of items) {
      await db.runAsync('insert into meal_items (id, meal_id, food_id, grams) values (?, ?, ?, ?)', uuid(), theId, it.food_id, it.grams);
    }
    const foodId = mealFoodId(theId);
    if (cookedWeight == null || cookedWeight <= 0) {
      await db.runAsync('update foods set deleted = 1, favourite = 0 where id = ?', foodId);
      return;
    }
    // totals of the pot → per 100 g of the ready dish
    const sum = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
    let micros: Micros = {};
    for (const it of items) {
      const f = await getFood(db, it.food_id);
      if (!f) continue;
      const n = portion(f, it.grams);
      sum.kcal += n.kcal; sum.protein += n.protein; sum.fat += n.fat; sum.carbs += n.carbs;
      micros = addMicros(micros, scaleMicros(microsPer100(f).values, it.grams));
    }
    const k = 100 / cookedWeight;
    const r2 = (x: number) => Math.round(x * k * 100) / 100;
    const per100 = Object.fromEntries(Object.entries(micros).map(([key, v]) => [key, Math.round((v ?? 0) * k * 1000) / 1000]));
    await db.runAsync(
      `insert into foods (id, source, name, kcal, protein, fat, carbs, sugar, fiber, servings, micros, meal_id, created_at, updated_at)
       values (?, 'custom', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(id) do update set name = excluded.name, kcal = excluded.kcal, protein = excluded.protein, fat = excluded.fat,
         carbs = excluded.carbs, sugar = excluded.sugar, fiber = excluded.fiber, micros = excluded.micros, deleted = 0, updated_at = excluded.updated_at`,
      foodId, name, r2(sum.kcal), r2(sum.protein), r2(sum.fat), r2(sum.carbs), per100.sugar ?? null, per100.fiber ?? null,
      JSON.stringify([{ name: 'порция', grams: 250 }]), JSON.stringify(per100), theId, now, now,
    );
  });
  return theId;
}

export async function deleteMeal(db: SQLiteDatabase, id: string) {
  await db.runAsync('delete from meals where id = ?', id);
  await db.runAsync('update foods set deleted = 1, favourite = 0 where id = ?', mealFoodId(id));
}

export async function logMeal(db: SQLiteDatabase, mealId: string, date: string, mealType: MealType, factor = 1) {
  const m = await getMeal(db, mealId);
  if (!m) return;
  for (const it of m.items) {
    const food = await getFood(db, it.food_id);
    if (food) await addFoodEntry(db, date, mealType, food, it.grams * factor, null);
  }
}

// ---------- measurements ----------

export async function measurementsForDate(db: SQLiteDatabase, date: string): Promise<MeasurementRow[]> {
  return db.getAllAsync<MeasurementRow>('select id, date, type, value from measurements where date = ?', date);
}

/** Latest value of each type on or before a date. */
export async function latestMeasurements(db: SQLiteDatabase, onOrBefore: string): Promise<Record<string, MeasurementRow>> {
  const rows = await db.getAllAsync<MeasurementRow>(
    `select m.id, m.date, m.type, m.value from measurements m
     join (select type, max(date) as d from measurements where date <= ? group by type) x on x.type = m.type and x.d = m.date`,
    onOrBefore,
  );
  return Object.fromEntries(rows.map((r) => [r.type, r]));
}

export async function setMeasurement(db: SQLiteDatabase, date: string, type: MeasurementType, value: number | null) {
  if (value == null || value <= 0) {
    await db.runAsync('delete from measurements where date = ? and type = ?', date, type);
    return;
  }
  const now = nowIso();
  await db.runAsync(
    `insert into measurements (id, date, type, value, created_at, updated_at) values (?, ?, ?, ?, ?, ?)
     on conflict(date, type) do update set value = excluded.value, updated_at = excluded.updated_at`,
    uuid(), date, type, value, now, now,
  );
}

export async function deleteMeasurementById(db: SQLiteDatabase, id: string) {
  await db.runAsync('delete from measurements where id = ?', id);
}

export async function series(db: SQLiteDatabase, type: string, from = '0000-01-01', to = '9999-12-31'): Promise<MeasurementRow[]> {
  return db.getAllAsync<MeasurementRow>(
    'select id, date, type, value from measurements where type = ? and date between ? and ? order by date',
    type,
    from,
    to,
  );
}

export async function measurementsBetween(db: SQLiteDatabase, from: string, to: string): Promise<MeasurementRow[]> {
  return db.getAllAsync<MeasurementRow>(
    'select id, date, type, value from measurements where date between ? and ? order by date',
    from,
    to,
  );
}

export async function measuredTypes(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ type: string }>('select distinct type from measurements');
  return rows.map((r) => r.type);
}

/** Weight trend from all weigh-ins on or before a date (anchored at the last weigh-in). */
export async function weightTrendAt(db: SQLiteDatabase, at: string): Promise<WeightTrend | null> {
  return weightTrend(await series(db, 'weight', '0000-01-01', at));
}

/** Weight to use for calculations: the smoothed trend (not the raw scale value), else the profile's start weight. */
export async function currentWeight(db: SQLiteDatabase, p: Profile, at: string): Promise<number> {
  return (await weightTrendAt(db, at))?.value ?? p.start_weight_kg;
}
