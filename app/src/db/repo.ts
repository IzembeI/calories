import type { SQLiteDatabase } from 'expo-sqlite';
import { randomUUID } from 'expo-crypto';
import { nowIso } from '@/lib/dates';
import type { ActivityLevel, Goal, MealType, Sex } from '@/lib/nutrition';
import type { MeasurementType } from '@/lib/measurements';
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
  kcal_auto: number;
  protein_pct: number;
  fat_pct: number;
  carbs_pct: number;
  water_goal_ml: number;
  glass_ml: number;
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
}

export type FoodInput = Omit<FoodRow, 'id' | 'favourite' | 'last_used_at' | 'servings'> & { servings: Serving[] };

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

export interface WaterRow { id: string; date: string; ml: number }
export interface ActivityRow { id: string; date: string; name: string; minutes: number; kcal: number }
export interface MeasurementRow { id: string; date: string; type: MeasurementType; value: number }
export interface MealRow { id: string; name: string; items: number; kcal: number }
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

// ---------- profile & settings ----------

export async function getProfile(db: SQLiteDatabase): Promise<Profile | null> {
  return db.getFirstAsync<Profile>('select * from profile where id = 1');
}

export async function saveProfile(db: SQLiteDatabase, p: Profile): Promise<void> {
  const now = nowIso();
  await db.runAsync(
    `insert into profile (id, sex, birth_date, height_cm, start_weight_kg, target_weight_kg, activity_level, goal,
       pace_kg_week, kcal_goal, kcal_auto, protein_pct, fat_pct, carbs_pct, water_goal_ml, glass_ml, created_at, updated_at)
     values (1, $sex, $birth, $h, $sw, $tw, $al, $goal, $pace, $kcal, $auto, $p, $f, $c, $water, $glass, $now, $now)
     on conflict(id) do update set sex=$sex, birth_date=$birth, height_cm=$h, start_weight_kg=$sw, target_weight_kg=$tw,
       activity_level=$al, goal=$goal, pace_kg_week=$pace, kcal_goal=$kcal, kcal_auto=$auto, protein_pct=$p, fat_pct=$f,
       carbs_pct=$c, water_goal_ml=$water, glass_ml=$glass, updated_at=$now`,
    {
      $sex: p.sex, $birth: p.birth_date, $h: p.height_cm, $sw: p.start_weight_kg, $tw: p.target_weight_kg,
      $al: p.activity_level, $goal: p.goal, $pace: p.pace_kg_week, $kcal: p.kcal_goal, $auto: p.kcal_auto,
      $p: p.protein_pct, $f: p.fat_pct, $c: p.carbs_pct, $water: p.water_goal_ml, $glass: p.glass_ml, $now: now,
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
  return db.getAllAsync<FoodRow>("select * from foods where deleted = 0 and source = 'custom' order by name");
}

export async function getFood(db: SQLiteDatabase, id: string): Promise<FoodRow | null> {
  return db.getFirstAsync<FoodRow>('select * from foods where id = ?', id);
}

export async function getFoodByBarcode(db: SQLiteDatabase, code: string): Promise<FoodRow | null> {
  return db.getFirstAsync<FoodRow>('select * from foods where barcode = ? and deleted = 0', code);
}

export async function saveFood(db: SQLiteDatabase, f: FoodInput, id?: string): Promise<string> {
  const now = nowIso();
  const existingByBarcode =
    !id && f.barcode ? await db.getFirstAsync<FoodRow & { deleted: number }>('select * from foods where barcode = ?', f.barcode) : null;
  if (existingByBarcode && existingByBarcode.source === 'custom' && f.source === 'off') {
    // the user's own product wins over Open Food Facts data
    if (existingByBarcode.deleted) await db.runAsync('update foods set deleted = 0 where id = ?', existingByBarcode.id);
    return existingByBarcode.id;
  }
  const theId = id ?? existingByBarcode?.id ?? uuid();
  await db.runAsync(
    `insert into foods (id, source, barcode, name, brand, kcal, protein, fat, carbs, sugar, fiber, salt, servings, created_at, updated_at)
     values ($id, $source, $barcode, $name, $brand, $kcal, $p, $f, $c, $sugar, $fiber, $salt, $servings, $now, $now)
     on conflict(id) do update set source=$source, barcode=$barcode, name=$name, brand=$brand, kcal=$kcal, protein=$p, fat=$f,
       carbs=$c, sugar=$sugar, fiber=$fiber, salt=$salt, servings=$servings, deleted=0, updated_at=$now`,
    {
      $id: theId, $source: f.source, $barcode: f.barcode || null, $name: f.name, $brand: f.brand || null,
      $kcal: f.kcal, $p: f.protein, $f: f.fat, $c: f.carbs, $sugar: f.sugar, $fiber: f.fiber, $salt: f.salt,
      $servings: JSON.stringify(f.servings), $now: now,
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

async function markUsed(db: SQLiteDatabase, foodId: string) {
  await db.runAsync('update foods set last_used_at = ?, use_count = use_count + 1 where id = ?', nowIso(), foodId);
}

// ---------- diary ----------

export async function addFoodEntry(
  db: SQLiteDatabase,
  date: string,
  meal: MealType,
  food: FoodRow,
  grams: number,
  servingLabel: string | null,
): Promise<void> {
  const n = portion(food, grams);
  const now = nowIso();
  await db.runAsync(
    `insert into diary_entries (id, date, meal_type, food_id, name, grams, serving_label, kcal, protein, fat, carbs, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    uuid(), date, meal, food.id, food.brand ? `${food.name} (${food.brand})` : food.name, grams, servingLabel,
    n.kcal, n.protein, n.fat, n.carbs, now, now,
  );
  await markUsed(db, food.id);
}

export async function addQuickEntry(
  db: SQLiteDatabase,
  date: string,
  meal: MealType,
  name: string,
  v: { kcal: number; protein: number; fat: number; carbs: number },
): Promise<void> {
  const now = nowIso();
  await db.runAsync(
    `insert into diary_entries (id, date, meal_type, food_id, name, grams, serving_label, kcal, protein, fat, carbs, created_at, updated_at)
     values (?, ?, ?, null, ?, null, null, ?, ?, ?, ?, ?, ?)`,
    uuid(), date, meal, name, v.kcal, v.protein, v.fat, v.carbs, now, now,
  );
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

export async function datesWithEntries(db: SQLiteDatabase, from: string, to: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ date: string }>('select distinct date from diary_entries where date between ? and ?', from, to);
  return new Set(rows.map((r) => r.date));
}

// ---------- meals (own dishes) ----------

export async function listMeals(db: SQLiteDatabase): Promise<MealRow[]> {
  return db.getAllAsync<MealRow>(
    `select m.id, m.name, count(i.id) as items, coalesce(sum(f.kcal * i.grams / 100), 0) as kcal
     from meals m left join meal_items i on i.meal_id = m.id left join foods f on f.id = i.food_id
     group by m.id order by m.name`,
  );
}

export async function getMeal(db: SQLiteDatabase, id: string) {
  const meal = await db.getFirstAsync<{ id: string; name: string }>('select id, name from meals where id = ?', id);
  const items = await db.getAllAsync<MealItemRow>(
    `select i.id, i.meal_id, i.food_id, i.grams, f.name, f.kcal, f.protein, f.fat, f.carbs
     from meal_items i join foods f on f.id = i.food_id where i.meal_id = ? order by rowid`,
    id,
  );
  return meal ? { ...meal, items } : null;
}

export async function saveMeal(db: SQLiteDatabase, id: string | null, name: string, items: { food_id: string; grams: number }[]) {
  const theId = id ?? uuid();
  const now = nowIso();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'insert into meals (id, name, created_at, updated_at) values (?, ?, ?, ?) on conflict(id) do update set name = excluded.name, updated_at = excluded.updated_at',
      theId, name, now, now,
    );
    await db.runAsync('delete from meal_items where meal_id = ?', theId);
    for (const it of items) {
      await db.runAsync('insert into meal_items (id, meal_id, food_id, grams) values (?, ?, ?, ?)', uuid(), theId, it.food_id, it.grams);
    }
  });
  return theId;
}

export async function deleteMeal(db: SQLiteDatabase, id: string) {
  await db.runAsync('delete from meals where id = ?', id);
}

export async function logMeal(db: SQLiteDatabase, mealId: string, date: string, mealType: MealType, factor = 1) {
  const m = await getMeal(db, mealId);
  if (!m) return;
  for (const it of m.items) {
    const food = await getFood(db, it.food_id);
    if (food) await addFoodEntry(db, date, mealType, food, it.grams * factor, null);
  }
}

// ---------- water & activity ----------

export async function waterForDate(db: SQLiteDatabase, date: string): Promise<number> {
  const r = await db.getFirstAsync<{ ml: number | null }>('select sum(ml) as ml from water_entries where date = ?', date);
  return r?.ml ?? 0;
}

export async function addWater(db: SQLiteDatabase, date: string, ml: number) {
  await db.runAsync('insert into water_entries (id, date, ml, created_at) values (?, ?, ?, ?)', uuid(), date, ml, nowIso());
}

export async function removeLastWater(db: SQLiteDatabase, date: string) {
  await db.runAsync(
    'delete from water_entries where id = (select id from water_entries where date = ? order by created_at desc limit 1)',
    date,
  );
}

export async function waterBetween(db: SQLiteDatabase, from: string, to: string) {
  return db.getAllAsync<{ date: string; ml: number }>(
    'select date, sum(ml) as ml from water_entries where date between ? and ? group by date order by date',
    from,
    to,
  );
}

export async function activitiesForDate(db: SQLiteDatabase, date: string): Promise<ActivityRow[]> {
  return db.getAllAsync<ActivityRow>('select * from activity_entries where date = ? order by created_at', date);
}

export async function activitiesBetween(db: SQLiteDatabase, from: string, to: string): Promise<ActivityRow[]> {
  return db.getAllAsync<ActivityRow>('select * from activity_entries where date between ? and ? order by date, created_at', from, to);
}

export async function addActivity(db: SQLiteDatabase, date: string, name: string, minutes: number, kcal: number) {
  await db.runAsync(
    'insert into activity_entries (id, date, name, minutes, kcal, created_at) values (?, ?, ?, ?, ?, ?)',
    uuid(), date, name, minutes, kcal, nowIso(),
  );
}

export async function deleteActivity(db: SQLiteDatabase, id: string) {
  await db.runAsync('delete from activity_entries where id = ?', id);
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

/** Weight to use for calculations: latest logged weight, else the profile's start weight. */
export async function currentWeight(db: SQLiteDatabase, p: Profile, at: string): Promise<number> {
  const r = await db.getFirstAsync<{ value: number }>(
    "select value from measurements where type = 'weight' and date <= ? order by date desc limit 1",
    at,
  );
  return r?.value ?? p.start_weight_kg;
}
