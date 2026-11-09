-- Калории: on-device SQLite schema, migration 1.
-- Dates: 'YYYY-MM-DD' local day. Timestamps: ISO-8601 UTC. Nutrients: per 100 g.

create table if not exists meta (
  key text primary key,
  value text not null
);

create table if not exists profile (
  id integer primary key check (id = 1),           -- single row
  sex text not null check (sex in ('male','female')),
  birth_date text not null,
  height_cm real not null check (height_cm between 100 and 250),
  start_weight_kg real not null,
  target_weight_kg real not null,
  activity_level text not null check (activity_level in ('sedentary','light','moderate','active','very_active')),
  goal text not null check (goal in ('lose','maintain','gain')),
  pace_kg_week real not null default 0.5,
  kcal_goal integer not null,
  protein_pct integer not null default 25,
  fat_pct integer not null default 30,
  carbs_pct integer not null default 45,
  water_goal_ml integer not null default 2000,
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
  servings text not null default '[]',   -- json [{"name":"шт","grams":60}]
  favourite integer not null default 0,
  last_used_at text,
  deleted integer not null default 0,     -- soft delete keeps history readable
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
  food_id text not null references foods(id) on delete restrict,
  grams real not null check (grams > 0)
);
create index if not exists meal_items_meal on meal_items (meal_id);

create table if not exists diary_entries (
  id text primary key,
  date text not null,
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  food_id text references foods(id) on delete set null,
  name text not null,                     -- snapshot
  grams real,                             -- null for quick add
  serving_label text,
  kcal real not null,                     -- snapshot totals for this entry
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
  type text not null check (type in ('weight','body_fat','neck','shoulders','chest','under_chest',
    'biceps_l','biceps_r','forearm_l','forearm_r','waist','belly','hips',
    'thigh_l','thigh_r','calf_l','calf_r','wrist')),
  value real not null check (value > 0),
  created_at text not null,
  updated_at text not null,
  unique (date, type)                     -- one value per type per day
);
create index if not exists measurements_type_date on measurements (type, date);
