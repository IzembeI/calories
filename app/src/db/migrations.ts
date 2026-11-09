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
];

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
