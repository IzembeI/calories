import type { SQLiteDatabase } from 'expo-sqlite';
import { BASIC_FOODS } from '@/data/basic-foods';
import { nowIso } from '@/lib/dates';

// Never edit a migration that has shipped; append a new one.
const MIGRATIONS: string[] = [
  `
  create table if not exists profile (
    id integer primary key check (id = 1),
    sex text not null check (sex in ('male','female')),
    birth_date text not null,
    height_cm real not null,
    start_weight_kg real not null,
    target_weight_kg real not null,
    activity_level text not null,
    goal text not null check (goal in ('lose','maintain','gain')),
    pace_kg_week real not null default 0.5,
    kcal_goal integer not null,
    kcal_auto integer not null default 1,
    protein_pct integer not null default 25,
    fat_pct integer not null default 30,
    carbs_pct integer not null default 45,
    water_goal_ml integer not null default 2000,
    glass_ml integer not null default 250,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists foods (
    id text primary key,
    source text not null check (source in ('builtin','off','custom')),
    barcode text,
    name text not null,
    brand text,
    kcal real not null,
    protein real,
    fat real,
    carbs real,
    sugar real,
    fiber real,
    salt real,
    servings text not null default '[]',
    favourite integer not null default 0,
    last_used_at text,
    use_count integer not null default 0,
    deleted integer not null default 0,
    created_at text not null,
    updated_at text not null
  );
  create unique index if not exists foods_barcode on foods (barcode) where barcode is not null;
  create index if not exists foods_name on foods (name collate nocase);
  create index if not exists foods_last_used on foods (last_used_at desc);

  create table if not exists meals (
    id text primary key,
    name text not null,
    created_at text not null,
    updated_at text not null
  );

  create table if not exists meal_items (
    id text primary key,
    meal_id text not null references meals(id) on delete cascade,
    food_id text not null references foods(id) on delete cascade,
    grams real not null check (grams > 0)
  );
  create index if not exists meal_items_meal on meal_items (meal_id);

  create table if not exists diary_entries (
    id text primary key,
    date text not null,
    meal_type text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
    food_id text references foods(id) on delete set null,
    name text not null,
    grams real,
    serving_label text,
    kcal real not null,
    protein real not null default 0,
    fat real not null default 0,
    carbs real not null default 0,
    created_at text not null,
    updated_at text not null
  );
  create index if not exists diary_date on diary_entries (date, meal_type);

  create table if not exists water_entries (
    id text primary key,
    date text not null,
    ml integer not null check (ml > 0),
    created_at text not null
  );
  create index if not exists water_date on water_entries (date);

  create table if not exists activity_entries (
    id text primary key,
    date text not null,
    name text not null,
    minutes integer not null check (minutes > 0),
    kcal real not null check (kcal >= 0),
    created_at text not null
  );
  create index if not exists activity_date on activity_entries (date);

  create table if not exists measurements (
    id text primary key,
    date text not null,
    type text not null,
    value real not null check (value > 0),
    created_at text not null,
    updated_at text not null,
    unique (date, type)
  );
  create index if not exists measurements_type_date on measurements (type, date);

  create table if not exists settings (
    key text primary key,
    value text not null
  );
  `,
  // 2: food category + real micronutrients from labels; one biceps/thigh instead of left/right
  `
  alter table foods add column category text;
  alter table foods add column micros text;
  update measurements set type = 'biceps' where type = 'biceps_r';
  update or ignore measurements set type = 'biceps' where type = 'biceps_l';
  update measurements set type = 'thigh' where type = 'thigh_r';
  update or ignore measurements set type = 'thigh' where type = 'thigh_l';
  `,
  // 3: optional fixed macro goals in grams (null = use percentages)
  `
  alter table profile add column protein_g real;
  alter table profile add column fat_g real;
  alter table profile add column carbs_g real;
  `,
  // 4: who owns kcal_goal ('formula' | 'adaptive' | 'manual'); replaces kcal_auto, which is kept in sync for old code and backups
  `
  alter table profile add column kcal_mode text not null default 'formula' check (kcal_mode in ('formula','adaptive','manual'));
  update profile set kcal_mode = 'manual' where kcal_auto = 0;
  `,
  // 5: protein goal in g per kg of body weight (null = mode off); reference weight: 'adjusted' = weight at BMI 27 when BMI >= 30, 'actual' = trend weight
  `
  alter table profile add column protein_gkg real;
  alter table profile add column protein_ref text not null default 'adjusted' check (protein_ref in ('adjusted','actual'));
  `,
  // 6: the user corrected a builtin / Open Food Facts product; such rows are never overwritten by OFF data
  `
  alter table foods add column edited integer not null default 0;
  `,
  // 7: the portion of the last diary entry of this food (total grams + serving name, null = grams); the food screen opens with it
  `
  alter table foods add column last_grams real;
  alter table foods add column last_serving text;
  `,
  // 8: more built-in foods (dry / raw pairs) and household measures; the rows are synced by AFTER[7]
  `
  select 1;
  `,
  // 9: a home-made dish weighed after cooking: the meal keeps its ready weight and owns a hidden food row with КБЖУ per 100 g
  `
  alter table meals add column cooked_weight_g real;
  alter table foods add column meal_id text;
  `,
  // 10: Nutri-Score grade (a–e) from Open Food Facts, when the product has one
  `
  alter table foods add column nutriscore text;
  `,
];

/** Code that runs right after the migration with the same index (inside its transaction). */
const AFTER: Record<number, (db: SQLiteDatabase) => Promise<void>> = {
  7: syncBasicFoods,
};

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const isFirst = version === 0;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      if (isFirst) await seedBasicFoods(db);
      await AFTER[version]?.(db);
    });
    version++;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}

async function seedBasicFoods(db: SQLiteDatabase) {
  const now = nowIso();
  const stmt = await db.prepareAsync(
    `insert or ignore into foods (id, source, name, kcal, protein, fat, carbs, servings, created_at, updated_at)
     values ($id, 'builtin', $name, $kcal, $p, $f, $c, $servings, $now, $now)`,
  );
  try {
    for (let i = 0; i < BASIC_FOODS.length; i++) {
      const [name, kcal, p, f, c, servings] = BASIC_FOODS[i];
      await stmt.executeAsync({
        $id: `builtin-${i + 1}`,
        $name: name,
        $kcal: kcal,
        $p: p,
        $f: f,
        $c: c,
        $servings: JSON.stringify(servings ?? []),
        $now: now,
      });
    }
  } finally {
    await stmt.finalizeAsync();
  }
}

/** Adds built-in foods that appeared since the install and refreshes the servings of the ones the user has not corrected. */
async function syncBasicFoods(db: SQLiteDatabase) {
  await seedBasicFoods(db);
  for (let i = 0; i < BASIC_FOODS.length; i++) {
    const servings = BASIC_FOODS[i][5];
    if (!servings?.length) continue;
    await db.runAsync(
      "update foods set servings = ? where id = ? and source = 'builtin' and edited = 0 and servings != ?",
      JSON.stringify(servings),
      `builtin-${i + 1}`,
      JSON.stringify(servings),
    );
  }
}
