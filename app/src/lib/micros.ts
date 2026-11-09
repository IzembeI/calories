// Approximate vitamins, minerals and sugars for any food from its name and KBJU.
// Reference values: USDA FoodData Central (see src/data/micro-ref.ts), daily values: adult norms
// close to Russian МР 2.3.1.0253-21. Everything here is an estimate unless the product had real data.
import type { SQLiteDatabase } from 'expo-sqlite';
import { MICRO_REF, type CategoryKey } from '@/data/micro-ref';

export type NutrientKey =
  | 'vit_a' | 'vit_c' | 'vit_d' | 'vit_e' | 'vit_k' | 'b1' | 'b2' | 'b3' | 'b6' | 'b9' | 'b12'
  | 'ca' | 'fe' | 'mg' | 'p' | 'k' | 'zn' | 'se' | 'na'
  | 'sugar' | 'added_sugar' | 'fiber' | 'sat_fat' | 'chol';

export type Micros = Partial<Record<NutrientKey, number>>;

export interface NutrientDef {
  key: NutrientKey;
  title: string;
  unit: string;
  dv: number;
  group: 'vitamin' | 'mineral' | 'other';
  /** true = upper limit (less is better) */
  limit?: boolean;
}

export const NUTRIENTS: NutrientDef[] = [
  { key: 'vit_a', title: 'Витамин A', unit: 'мкг', dv: 900, group: 'vitamin' },
  { key: 'vit_c', title: 'Витамин C', unit: 'мг', dv: 100, group: 'vitamin' },
  { key: 'vit_d', title: 'Витамин D', unit: 'мкг', dv: 15, group: 'vitamin' },
  { key: 'vit_e', title: 'Витамин E', unit: 'мг', dv: 15, group: 'vitamin' },
  { key: 'vit_k', title: 'Витамин K', unit: 'мкг', dv: 120, group: 'vitamin' },
  { key: 'b1', title: 'B1 (тиамин)', unit: 'мг', dv: 1.5, group: 'vitamin' },
  { key: 'b2', title: 'B2 (рибофлавин)', unit: 'мг', dv: 1.8, group: 'vitamin' },
  { key: 'b3', title: 'B3 (ниацин)', unit: 'мг', dv: 20, group: 'vitamin' },
  { key: 'b6', title: 'B6', unit: 'мг', dv: 2, group: 'vitamin' },
  { key: 'b9', title: 'B9 (фолаты)', unit: 'мкг', dv: 400, group: 'vitamin' },
  { key: 'b12', title: 'B12', unit: 'мкг', dv: 3, group: 'vitamin' },
  { key: 'ca', title: 'Кальций', unit: 'мг', dv: 1000, group: 'mineral' },
  { key: 'fe', title: 'Железо', unit: 'мг', dv: 14, group: 'mineral' },
  { key: 'mg', title: 'Магний', unit: 'мг', dv: 420, group: 'mineral' },
  { key: 'p', title: 'Фосфор', unit: 'мг', dv: 700, group: 'mineral' },
  { key: 'k', title: 'Калий', unit: 'мг', dv: 3500, group: 'mineral' },
  { key: 'zn', title: 'Цинк', unit: 'мг', dv: 12, group: 'mineral' },
  { key: 'se', title: 'Селен', unit: 'мкг', dv: 70, group: 'mineral' },
  { key: 'na', title: 'Натрий', unit: 'мг', dv: 2000, group: 'mineral', limit: true },
  { key: 'fiber', title: 'Клетчатка', unit: 'г', dv: 25, group: 'other' },
  { key: 'sugar', title: 'Сахара всего', unit: 'г', dv: 90, group: 'other', limit: true },
  { key: 'added_sugar', title: 'Добавленный сахар', unit: 'г', dv: 50, group: 'other', limit: true },
  { key: 'sat_fat', title: 'Насыщенные жиры', unit: 'г', dv: 22, group: 'other', limit: true },
  { key: 'chol', title: 'Холестерин', unit: 'мг', dv: 300, group: 'other', limit: true },
];

const REF_KEYS: NutrientKey[] = ['vit_a', 'vit_c', 'vit_d', 'vit_e', 'vit_k', 'b1', 'b2', 'b3', 'b6', 'b9', 'b12', 'ca', 'fe', 'mg', 'p', 'k', 'zn', 'se', 'na', 'chol'];

export const CATEGORIES: { key: CategoryKey; title: string }[] = (Object.keys(MICRO_REF) as CategoryKey[]).map((k) => ({
  key: k,
  title: MICRO_REF[k].title,
}));

// Russian and English keywords → category. Order matters: specific rules first.
// `\b` in these sources means "end of word" for Cyrillic too (JS \b is ASCII-only), see rx().
const rx = (src: string) => new RegExp(src.replace(/\\b/g, '(?![a-zа-яё])'), 'i');
const RULES: [RegExp, CategoryKey][] = (
  [
    [String.raw`чай\b|кофе|вода\b|минерал|tea\b|coffee|water|espresso`, 'drinks'],
    [String.raw`сок\b|сока\b|кола\b|cola|лимонад|газиров|морс|компот|кисель|нектар|энергетик|juice|soda|lemonade|soft drink|nectar|energy drink`, 'sweet_drinks'],
    [String.raw`колбас|сосиск|сарделек|сарделька|ветчин|бекон|салями|буженин|карбонад|паштет|sausage|ham\b|bacon|salami|frankfurt|hot dog`, 'processed_meat'],
    [String.raw`шоколад|конфет|nutella|chocolate|candy`, 'sweets'],
    [String.raw`печень(?![еяю])|печени|печенк|liver|субпродукт`, 'liver'],
    [String.raw`творожн\S* сыр|сыр творожн|плавлен|cream cheese`, 'cheese'],
    [String.raw`сырник|творог|cottage|curd|зернен`, 'cottage_cheese'],
    [String.raw`сыр\b|сыра\b|моцарел|пармезан|фета\b|брынз|чеддер|гауд|cheese|mozzarell|parmesan`, 'cheese'],
    [String.raw`морожен|глазирован|сырок|йогурт (фрукт|клубн|персик|вишн)|молочный коктейль|какао|ice cream|chocolate milk|fruit yog`, 'sweet_dairy'],
    [String.raw`кефир|молок|молоч|ряженк|простокваш|айран|варенец|ацидофил|йогурт|milk|kefir|yogh?urt|skyr`, 'milk'],
    [String.raw`сметан|сливк|cream`, 'cream'],
    [String.raw`сливочн\S* масл|масло сливоч|butter|ghee|топлен`, 'butter'],
    [String.raw`масл[оа] (подсолн|оливк|растит|льнян|кукуруз|рапс)|подсолнечн\S* масл|оливков\S* масл|(^|[^a-z])oil\b`, 'oils'],
    [String.raw`майонез|кетчуп|соус|горчиц|хумус|mayonnaise|ketchup|sauce|mustard|hummus|dressing`, 'sauces'],
    [String.raw`лосос|семг|форел|скумбри|сельд|селед|сардин|кета\b|горбуш|нерк|кижуч|угор|палтус|salmon|trout|mackerel|herring|sardine`, 'fatty_fish'],
    [String.raw`треск|минта|тунец|тунц|хек\b|судак|окун|щук|тилапи|навага|пикш|рыб|cod\b|pollock|tuna|hake|fish`, 'lean_fish'],
    [String.raw`кревет|кальмар|мидии|краб|осьмин|гребеш|икра|морепрод|shrimp|squid|mussel|crab|seafood|caviar`, 'seafood'],
    [String.raw`курица|куриц|курин|индейк|индюш|цыпл|утка|утки|утиная|гусь|chicken|turkey|duck`, 'poultry'],
    [String.raw`говядин|свинин|баранин|телятин|фарш|котлет|шашлык|стейк|мясо|мясн|бифштекс|тефтел|beef|pork|lamb|veal|steak|meat`, 'red_meat'],
    [String.raw`яйц|яичн|омлет|egg|omelet`, 'eggs'],
    [String.raw`пельмен|вареник|борщ|щи\b|суп\b|супа\b|солянк|рассольник|плов|голубц|салат(?! лист)|винегрет|оливье|шаурм|бургер|пицц|ролл|суши|лазань|болоньез|запеканк|soup|pizza|burger|lasagn|sushi|stew`, 'mixed_dish'],
    [String.raw`шпинат|салат лист|руккол|айсберг|латук|петрушк|укроп|кинз|зелень|щавел|spinach|lettuce|arugula|kale|parsley|dill|herbs`, 'leafy'],
    [String.raw`квашен|соленые|соленый|соленья|маринован|pickle|sauerkraut`, 'pickles'],
    [String.raw`гриб|шампиньон|вешенк|опят|mushroom`, 'mushrooms'],
    [String.raw`авокадо|оливк|олива\b|маслин|avocado|olive`, 'avocado_olives'],
    [String.raw`картоф|картош|фри\b|чипс|potato|fries|chips`, 'potato'],
    [String.raw`огур|помидор|томат|перец|морков|капуст|брокколи|кабач|баклажан|лук\b|чеснок|свекл|редис|тыкв|кукуруз|горошек|стручк|сельдер|овощ|cucumber|tomato|pepper|carrot|cabbage|broccoli|zucchini|eggplant|onion|garlic|beet|pumpkin|corn\b|vegetable`, 'vegetables'],
    [String.raw`апельсин|мандарин|лимон|грейпфрут|лайм|помело|orange|tangerine|lemon|grapefruit|lime\b`, 'citrus'],
    [String.raw`клубник|малин|черник|голубик|ежевик|смородин|клюкв|брусник|вишн|черешн|ягод|strawberr|raspberr|blueberr|blackberr|currant|cranberr|cherr|berr`, 'berries'],
    [String.raw`финик|кураг|изюм|чернослив|сухофрукт|dates\b|raisin|prune|dried fruit`, 'dried_fruit'],
    [String.raw`яблок|банан|груш|виноград|персик|абрикос|слива\b|сливы\b|ананас|манго|дыня|дыни|арбуз|киви|хурм|гранат|фрукт|apple|banana|pear\b|grape|peach|apricot|plum|pineapple|mango|melon|kiwi|persimmon|fruit`, 'fruits'],
    [String.raw`орех|миндал|арахис|кешью|фундук|фисташ|семечк|семена|кунжут|чиа\b|nut\b|nuts\b|almond|peanut|cashew|hazelnut|pistachio|seed`, 'nuts_seeds'],
    [String.raw`чечевиц|нут\b|фасол|горох|бобы\b|маш\b|соя\b|lentil|chickpea|bean`, 'legumes'],
    [String.raw`шоколад|конфет|сахар|мед\b|варень|джем|повидл|зефир|пастил|мармелад|халв|торт|пирожн|вафл|батончик|сгущ|nutella|candy|chocolate|sugar|honey|jam\b|marshmallow|cake|wafer|bar\b`, 'sweets'],
    [String.raw`печенье|печенья|пряник|круассан|блин|оладь|пирог|пирожок|булк|булочк|кекс|маффин|сушк|баранк|крекер|cookie|croissant|pancake|muffin|bun\b|cracker|pastry`, 'bakery'],
    [String.raw`хлеб|батон|багет|лаваш|хлебц|тост|bread|baguette|toast|pita`, 'bread'],
    [String.raw`макарон|спагетти|паста\b|лапш|вермишел|pasta|spaghetti|noodle|macaroni`, 'pasta'],
    [String.raw`(гречк|рис|овсян|геркулес|пшен|перлов|булгур|киноа|манк|кускус|ячнев|каша|хлопья).*(сух|крупа)|крупа|мука\b|хлопья|мюсли|гранол|flour|oats\b|granola|muesli|cereal`, 'grains_dry'],
    [String.raw`гречк|гречнев|рис\b|риса\b|рисов|овсян|геркулес|пшен|перлов|булгур|киноа|манн|кускус|ячнев|каша|rice|buckwheat|oatmeal|porridge|quinoa|bulgur|couscous`, 'grains_cooked'],
    [String.raw`пиво|вино\b|водк|коньяк|виски|сидр|beer|wine|vodka|whisk|cider`, 'alcohol'],
    [String.raw`протеин|protein`, 'milk'],
  ] as [string, CategoryKey][]
).map(([src, cat]) => [rx(src), cat]);

export function guessCategory(name: string): CategoryKey {
  const n = name.toLowerCase().replace(/ё/g, 'е').replace(/без сахара|без добавления сахара|без сах\S*/g, '');
  for (const [re, cat] of RULES) if (re.test(n)) return cat;
  return 'mixed_dish';
}

export function categoryTitle(key: string | null | undefined): string {
  return key && key in MICRO_REF ? MICRO_REF[key as CategoryKey].title : 'Готовые блюда, супы';
}

interface FoodLike {
  name: string;
  category?: string | null;
  micros?: string | null;
  kcal: number;
  carbs: number | null;
  fat: number | null;
  sugar?: number | null;
  fiber?: number | null;
  salt?: number | null;
}

/** Per 100 g. `estimated` = some values came from the category reference rather than the product label. */
export function microsPer100(f: FoodLike): { values: Micros; estimated: boolean; category: CategoryKey } {
  const category = (f.category && f.category in MICRO_REF ? f.category : guessCategory(f.name)) as CategoryKey;
  const ref = MICRO_REF[category].per100 as Record<string, number>;
  let real: Micros = {};
  if (f.micros) {
    try {
      real = JSON.parse(f.micros) as Micros;
    } catch {
      real = {};
    }
  }
  const out: Micros = {};
  let estimated = false;
  // Products with ~0 kcal (water, tea, diet soda) carry no meaningful micros from the reference.
  const scale = f.kcal < 5 && category !== 'drinks' ? 0 : 1;
  for (const k of REF_KEYS) {
    if (real[k] != null) out[k] = real[k];
    else {
      out[k] = (ref[k] ?? 0) * scale;
      estimated = true;
    }
  }
  if (f.salt != null && real.na == null) out.na = f.salt * 400; // 1 g salt ≈ 400 mg sodium
  const carbs = f.carbs ?? 0;
  const fat = f.fat ?? 0;
  out.sugar = real.sugar ?? f.sugar ?? carbs * ref.sugar_per_carb;
  out.added_sugar = real.added_sugar ?? (out.sugar ?? 0) * ref.added_share;
  out.fiber = real.fiber ?? f.fiber ?? carbs * ref.fiber_per_carb;
  out.sat_fat = real.sat_fat ?? fat * ref.sat_per_fat;
  if (real.added_sugar == null || f.sugar == null) estimated = true;
  return { values: out, estimated, category };
}

export function scaleMicros(m: Micros, grams: number): Micros {
  const k = grams / 100;
  const out: Micros = {};
  for (const [key, v] of Object.entries(m)) out[key as NutrientKey] = (v ?? 0) * k;
  return out;
}

export function addMicros(a: Micros, b: Micros): Micros {
  const out: Micros = { ...a };
  for (const [key, v] of Object.entries(b)) out[key as NutrientKey] = (out[key as NutrientKey] ?? 0) + (v ?? 0);
  return out;
}

type Row = FoodLike & { grams: number; date: string };

/** Sum of micros over diary entries in a date range, per day. Quick-add entries have no food and are skipped. */
export async function microsByDay(db: SQLiteDatabase, from: string, to: string): Promise<Map<string, Micros>> {
  const rows = await db.getAllAsync<Row>(
    `select e.date, e.grams, f.name, f.category, f.micros, f.kcal, f.carbs, f.fat, f.sugar, f.fiber, f.salt
     from diary_entries e join foods f on f.id = e.food_id
     where e.date between ? and ? and e.grams is not null`,
    from,
    to,
  );
  const cache = new Map<string, Micros>();
  const out = new Map<string, Micros>();
  for (const r of rows) {
    const key = `${r.name}|${r.category}|${r.micros}|${r.kcal}|${r.carbs}|${r.fat}`;
    let per100 = cache.get(key);
    if (!per100) {
      per100 = microsPer100(r).values;
      cache.set(key, per100);
    }
    out.set(r.date, addMicros(out.get(r.date) ?? {}, scaleMicros(per100, r.grams)));
  }
  return out;
}

export async function dayMicros(db: SQLiteDatabase, date: string): Promise<Micros> {
  return (await microsByDay(db, date, date)).get(date) ?? {};
}

export function pctDV(def: NutrientDef, value: number | undefined): number {
  return def.dv > 0 ? ((value ?? 0) / def.dv) * 100 : 0;
}

/** How many vitamins and minerals reach ~80% of the daily value. */
export function microsScore(m: Micros): { ok: number; total: number } {
  const defs = NUTRIENTS.filter((d) => d.group !== 'other' && !d.limit);
  return { ok: defs.filter((d) => pctDV(d, m[d.key]) >= 80).length, total: defs.length };
}
