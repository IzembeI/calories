// Approximate vitamins, minerals and sugars for any food from its name and KBJU.
// Reference values: USDA FoodData Central (see src/data/micro-ref.ts), daily values: МР 2.3.1.0253-21
// by sex and age (see src/data/norms.ts, dvFor). Everything here is an estimate unless the product had real data.
import type { SQLiteDatabase } from 'expo-sqlite';
import { MICRO_FOODS, MICRO_FOOD_COLUMNS } from '@/data/micro-foods';
import { MICRO_REF, type CategoryKey } from '@/data/micro-ref';
import { ADDED_SUGAR_SHARE, ADDED_SUGAR_SHARE_OVERWEIGHT, NORMS, SAT_FAT_SHARE, type Norm, type SexNorm } from '@/data/norms';
import { ageFrom } from './dates';
import { bmi, type Sex } from './nutrition';

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
    [String.raw`сок\b|сока\b|(^|[^а-яё])кола\b|cola|лимонад|газиров|морс|компот|кисель|нектар|энергетик|juice|soda|lemonade|soft drink|nectar|energy drink`, 'sweet_drinks'],
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
    // before poultry: «яйцо куриное» is an egg
    [String.raw`яйцо\b|яйца\b|яиц\b|яичниц|омлет`, 'eggs'],
    [String.raw`курица|куриц|курин|индейк|индюш|цыпл|утка|утки|утиная|гусь|chicken|turkey|duck`, 'poultry'],
    [String.raw`говядин|говяж|свинин|свиной|свиная|свиные|баранин|бараньи|телятин|фарш|котлет|шашлык|стейк|мясо|мясн|бифштекс|тефтел|beef|pork|lamb|veal|steak|meat`, 'red_meat'],
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

const norm = (name: string) => name.toLowerCase().replace(/ё/g, 'е').replace(/без сахара|без добавления сахара|без сах\S*/g, '');

/** Category by keywords, or null when nothing in the name is recognised. */
function matchCategory(name: string): CategoryKey | null {
  const n = norm(name);
  for (const [re, cat] of RULES) if (re.test(n)) return cat;
  return null;
}

export function guessCategory(name: string): CategoryKey {
  return matchCategory(name) ?? 'mixed_dish';
}

// ---------- composite foods: a dish is estimated as a blend of categories ----------
// One category is a poor guess for «бургер» or «гречка с курицей». A dish is described as parts
// (bun + patty + cheese…), and the shares are then fitted to the КБЖУ the user entered, so the
// estimate follows the real product: more protein and fat → more of the meat part, and so on.

/** A part of a blend; 'water' dilutes (soups, porridge on water) and carries nothing. */
export type PartKey = CategoryKey | 'water';
export interface Part { key: PartKey; share: number }

/** Typical protein / fat / carbs per 100 g of a category (USDA averages): only used to fit the shares of a blend. */
const CATEGORY_MACROS = {
  ...(Object.fromEntries((Object.keys(MICRO_REF) as CategoryKey[]).map((k) => [k, MICRO_REF[k].per100.macros])) as unknown as Record<CategoryKey, readonly [number, number, number]>),
  water: [0, 0, 0],
} as Record<PartKey, readonly [number, number, number]>;

const refOf = (c: CategoryKey) => MICRO_REF[c].per100 as unknown as Record<string, number>;

/** Which meat a dish is made of, by its name. */
const meatOf = (n: string): CategoryKey =>
  /кури|курин|цыпл|индейк|chicken|turkey/.test(n) ? 'poultry'
  : /лосос|семг|форел|salmon/.test(n) ? 'fatty_fish'
  : /рыб|треск|тунц|минта|fish|tuna/.test(n) ? 'lean_fish'
  : /кревет|shrimp/.test(n) ? 'seafood'
  : 'red_meat';

type Recipe = Partial<Record<PartKey, number>>;
/** Known dishes: typical shares by weight. Checked before anything else; `m` is the meat from the name. */
const DISHES: [RegExp, (n: string, m: CategoryKey) => Recipe][] = [
  [/(^|[^а-яе])суп(а|ы|ом|чик)?(?![а-яе])|борщ|(^|[^а-яе])щи(?![а-яе])|солянк|рассольник|бульон|(^|[^а-яе])уха(?![а-яе])|окрошк|харчо|soup|broth/, (_n, m) => ({ water: 0.6, vegetables: 0.2, potato: 0.08, [m]: 0.12 })],
  [/бургер|burger/, (n, m) => ({ bread: 0.33, [m]: 0.35, vegetables: 0.12, sauces: 0.1, ...(/чиз|сыр|cheese/.test(n) ? { cheese: 0.1 } : {}) })],
  [/шаурм|шаверм|донер|кебаб в лаваше|буррито|shawarma|burrito|wrap/, (n, m) => ({ bread: 0.28, [m === 'red_meat' && !/говя|свин|баран|beef|pork|lamb/.test(n) ? 'poultry' : m]: 0.32, vegetables: 0.28, sauces: 0.12 })],
  [/пицц|pizza/, () => ({ bread: 0.5, cheese: 0.2, sauces: 0.1, processed_meat: 0.1, vegetables: 0.1 })],
  [/пельмен|манты|хинкал|dumpling/, (_n, m) => ({ pasta: 0.55, [m]: 0.4, vegetables: 0.05 })],
  [/вареник/, (n) => ({ pasta: 0.6, [/творог/.test(n) ? 'cottage_cheese' : /вишн|ягод/.test(n) ? 'berries' : 'potato']: 0.4 })],
  [/плов|ризотто|паэль|risotto|paella/, (_n, m) => ({ grains_cooked: 0.62, [m]: 0.25, vegetables: 0.08, oils: 0.05 })],
  [/сырник/, () => ({ cottage_cheese: 0.7, grains_dry: 0.15, eggs: 0.1, sweets: 0.05 })],
  [/блин|оладь|pancake|crepe/, () => ({ grains_dry: 0.35, milk: 0.45, eggs: 0.15, oils: 0.05 })],
  [/оливье/, () => ({ potato: 0.3, processed_meat: 0.2, eggs: 0.15, vegetables: 0.15, pickles: 0.1, sauces: 0.1 })],
  [/цезар|caesar/, (_n, m) => ({ leafy: 0.4, [m]: 0.3, cheese: 0.1, bread: 0.1, sauces: 0.1 })],
  [/винегрет/, () => ({ vegetables: 0.6, potato: 0.2, pickles: 0.15, oils: 0.05 })],
  [/ролл|суши|sushi|roll/, () => ({ grains_cooked: 0.7, fatty_fish: 0.2, vegetables: 0.1 })],
  [/голубц|перец фарширован/, (_n, m) => ({ vegetables: 0.5, [m]: 0.3, grains_cooked: 0.2 })],
  [/лазань|болоньез|карбонар|lasagn|bolognese|carbonara/, (_n, m) => ({ pasta: 0.5, [m]: 0.22, cheese: 0.1, sauces: 0.18 })],
  [/омлет|omelet/, () => ({ eggs: 0.75, milk: 0.25 })],
  [/бутерброд|сэндвич|сендвич|тост с|sandwich/, (n, m) => ({ bread: 0.5, [/сыр|cheese/.test(n) ? 'cheese' : /колбас|ветчин|ham/.test(n) ? 'processed_meat' : m]: 0.35, vegetables: 0.15 })],
  [/запеканк\S* творож|творожн\S* запеканк/, () => ({ cottage_cheese: 0.7, eggs: 0.1, grains_dry: 0.12, sweets: 0.08 })],
  [/котлет|тефтел|фрикадел|биточк|meatball|cutlet/, (_n, m) => ({ [m]: 0.75, bread: 0.15, vegetables: 0.07, eggs: 0.03 })],
];

/** Words that join two foods in a name: «гречка с курицей», «овсянка на молоке», «рис и овощи». */
const JOIN = /\s+(?:с|со|и|на|в|под|with|and|in)\s+|\s*[,+]\s*/;

/** Starting shares for a food: a known dish, or the foods named around «с / и / на», or null for a plain food. */
function recipeFor(name: string): { prior: Recipe; strength: number } | null {
  const n = norm(name);
  for (const [re, make] of DISHES) if (re.test(n)) return { prior: make(n, meatOf(n)), strength: 300 };
  const cats: CategoryKey[] = [];
  for (const part of n.split(JOIN)) {
    const c = part.trim() ? matchCategory(part) : null;
    if (c && !cats.includes(c)) cats.push(c);
  }
  if (cats.length < 2) return null;
  // the first word is the base of the dish, the rest are additions
  const rest = 0.4 / (cats.length - 1);
  return { prior: Object.fromEntries(cats.slice(0, 4).map((c, i) => [c, i === 0 ? 0.6 : rest])), strength: 30 };
}

/** Euclidean projection onto the simplex {w ≥ 0, Σw = 1}. */
function toSimplex(v: number[]): number[] {
  const u = [...v].sort((a, b) => b - a);
  let sum = 0;
  let theta = 0;
  for (let i = 0; i < u.length; i++) {
    sum += u[i];
    const t = (sum - 1) / (i + 1);
    if (u[i] - t > 0) theta = t;
  }
  return v.map((x) => Math.max(x - theta, 0));
}

/**
 * Shares of the parts that best explain the entered protein / fat / carbs while staying near the recipe:
 * minimise |Σ wᵢ·macrosᵢ − entered|² + strength·|w − prior|² over w ≥ 0, Σw = 1 (projected gradient).
 */
function fitShares(prior: Recipe, strength: number, macros: [number, number, number]): Part[] {
  const keys = Object.keys(prior) as PartKey[];
  if (!keys.includes('water')) keys.push('water');
  const w0 = keys.map((k) => prior[k] ?? 0);
  const M = keys.map((k) => CATEGORY_MACROS[k]);
  const L = 2 * M.reduce((a, m) => a + m[0] * m[0] + m[1] * m[1] + m[2] * m[2], 0) + 2 * strength;
  let w = toSimplex(w0);
  for (let it = 0; it < 300; it++) {
    const err = [0, 1, 2].map((j) => w.reduce((a, wi, i) => a + wi * M[i][j], 0) - macros[j]);
    const grad = w.map((wi, i) => 2 * (err[0] * M[i][0] + err[1] * M[i][1] + err[2] * M[i][2]) + 2 * strength * (wi - w0[i]));
    w = toSimplex(w.map((wi, i) => wi - grad[i] / L));
  }
  return keys.map((key, i) => ({ key, share: w[i] })).filter((p) => p.share >= 0.02);
}

/** Parts of a composite food fitted to its КБЖУ, or null when the food is a single category. */
export function partsOf(f: { name: string; protein?: number | null; fat?: number | null; carbs?: number | null }): Part[] | null {
  const r = recipeFor(f.name);
  if (!r) return null;
  const parts = fitShares(r.prior, r.strength, [f.protein ?? 0, f.fat ?? 0, f.carbs ?? 0]);
  return parts.filter((p) => p.key !== 'water').length >= 2 ? parts : null;
}

/** «хлеб 35%, говядина 33%, овощи 12%» */
export function partsText(parts: Part[]): string {
  return parts
    .filter((p) => p.key !== 'water')
    .sort((a, b) => b.share - a.share)
    .map((p) => `${MICRO_REF[p.key as CategoryKey].title.split(',')[0].toLowerCase()} ${Math.round(p.share * 100)}%`)
    .join(', ');
}

export function categoryTitle(key: string | null | undefined): string {
  return key && key in MICRO_REF ? MICRO_REF[key as CategoryKey].title : 'Готовые блюда, супы';
}

interface FoodLike {
  name: string;
  category?: string | null;
  micros?: string | null;
  kcal: number;
  protein?: number | null;
  carbs: number | null;
  fat: number | null;
  sugar?: number | null;
  fiber?: number | null;
  salt?: number | null;
}

/** Per 100 g. `estimated` = some values came from the category reference rather than the product label. */
// ---------- specific foods ----------
// 217 common foods with their own USDA values and variants (raw, boiled, fried…). The variant closest to the
// entered protein / fat / carbs is used, so «гречка» at 313 kcal is the dry groats and at 110 kcal the cooked ones.
const FOODS = MICRO_FOODS.map((f) => ({ re: rx(f.re), v: f.v }));
const COL = Object.fromEntries(MICRO_FOOD_COLUMNS.map((c, i) => [c, i])) as Record<(typeof MICRO_FOOD_COLUMNS)[number], number>;

/** Reference values of the specific food named by `f.name`, or null when none matches or its macros are too far off. */
function specificRef(f: FoodLike, category: CategoryKey): Record<string, number> | null {
  const n = norm(f.name);
  const item = FOODS.find((x) => x.re.test(n));
  if (!item) return null;
  const p = f.protein ?? 0;
  const fat = f.fat ?? 0;
  const c = f.carbs ?? 0;
  let best = item.v[0];
  let dist = Infinity;
  for (const v of item.v) {
    const d = Math.abs(v[COL.protein] - p) + Math.abs(v[COL.fat] - fat) + Math.abs(v[COL.carb] - c);
    if (d < dist) {
      dist = d;
      best = v;
    }
  }
  // the name matched an ingredient, not the food itself («куриный суп» is not chicken): leave it to the category
  if (dist > 12 + 0.25 * (p + fat + c)) return null;
  const out: Record<string, number> = {};
  for (const k of REF_KEYS) out[k] = best[COL[k as keyof typeof COL]];
  const carb = best[COL.carb];
  out.sugar_per_carb = carb > 0.5 ? Math.min(best[COL.sugar] / carb, 1) : 0;
  out.fiber_per_carb = carb > 0.5 ? Math.min(best[COL.fiber] / carb, 1) : 0;
  out.sat_per_fat = best[COL.fat] > 0.3 ? Math.min(best[COL.satfat] / best[COL.fat], 1) : 0;
  out.added_share = refOf(category).added_share;
  return out;
}

export function microsPer100(f: FoodLike): { values: Micros; estimated: boolean; category: CategoryKey; parts: Part[] | null; specific: boolean } {
  const guessed = guessCategory(f.name);
  const category = (f.category && f.category in MICRO_REF ? f.category : guessed) as CategoryKey;
  // A category the user picked by hand wins; otherwise a dish is estimated as a blend of its parts.
  const parts = category === guessed ? partsOf(f) : null;
  // then a specific food from the USDA table, and only then the average of the category
  const own = !parts && category === guessed ? specificRef(f, category) : null;
  const ref = parts ? blendRef(parts) : (own ?? refOf(category));
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
  return { values: out, estimated, category, parts, specific: own != null };
}

/** Reference values of a blend: micros by share; the sugar / fiber / saturated-fat ratios by each part's carbs or fat. */
function blendRef(parts: Part[]): Record<string, number> {
  const out: Record<string, number> = {};
  let carbs = 0;
  let fat = 0;
  const ratio = { sugar_per_carb: 0, fiber_per_carb: 0, added: 0, sat_per_fat: 0 };
  for (const p of parts) {
    if (p.key === 'water') continue;
    const ref = refOf(p.key);
    for (const k of REF_KEYS) out[k] = (out[k] ?? 0) + (ref[k] ?? 0) * p.share;
    const [, f, c] = CATEGORY_MACROS[p.key];
    carbs += c * p.share;
    fat += f * p.share;
    ratio.sugar_per_carb += ref.sugar_per_carb * c * p.share;
    ratio.fiber_per_carb += ref.fiber_per_carb * c * p.share;
    ratio.added += ref.sugar_per_carb * ref.added_share * c * p.share;
    ratio.sat_per_fat += ref.sat_per_fat * f * p.share;
  }
  out.sugar_per_carb = carbs > 0 ? ratio.sugar_per_carb / carbs : 0;
  out.fiber_per_carb = carbs > 0 ? ratio.fiber_per_carb / carbs : 0;
  out.added_share = ratio.sugar_per_carb > 0 ? ratio.added / ratio.sugar_per_carb : 0;
  out.sat_per_fat = fat > 0 ? ratio.sat_per_fat / fat : 0;
  return out;
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
    `select e.date, e.grams, f.name, f.category, f.micros, f.kcal, f.protein, f.carbs, f.fat, f.sugar, f.fiber, f.salt
     from diary_entries e join foods f on f.id = e.food_id
     where e.date between ? and ? and e.grams is not null`,
    from,
    to,
  );
  const cache = new Map<string, Micros>();
  const out = new Map<string, Micros>();
  for (const r of rows) {
    const key = `${r.name}|${r.category}|${r.micros}|${r.kcal}|${r.protein}|${r.carbs}|${r.fat}`;
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

/**
 * True when the day's fiber total comes only from real values (label or product fiber field).
 * Quick-add entries and foods without a fiber value make it an estimate.
 */
export async function dayFiberExact(db: SQLiteDatabase, date: string): Promise<boolean> {
  const rows = await db.getAllAsync<{ grams: number | null; fiber: number | null; micros: string | null; has_food: number }>(
    `select e.grams, f.fiber, f.micros, f.id is not null as has_food
     from diary_entries e left join foods f on f.id = e.food_id
     where e.date = ?`,
    date,
  );
  if (!rows.length) return false;
  return rows.every((r) => {
    if (!r.has_food || r.grams == null) return false;
    if (r.fiber != null) return true;
    try {
      return r.micros != null && (JSON.parse(r.micros) as Micros).fiber != null;
    } catch {
      return false;
    }
  });
}

/** What the personal norms depend on. `weight_kg` is the current (trend) weight; start weight is used without it. */
export interface NormProfile {
  sex: Sex;
  birth_date: string;
  kcal_goal: number;
  height_cm: number;
  start_weight_kg: number;
  weight_kg?: number;
}

function pickNorm(n: Norm, sex: Sex, age: number): number {
  const v: SexNorm = typeof n === 'object' && !Array.isArray(n) ? n[sex] : n;
  if (typeof v === 'number') return v;
  let out = v[0][1];
  for (const [from, value] of v) if (age >= from) out = value;
  return out;
}

/** Daily value for this person: МР 2.3.1.0253-21 by sex and age, sugar and saturated fat from the kcal goal. */
export function dvFor(def: NutrientDef, p?: NormProfile | null): number {
  if (!p) return def.dv;
  if (def.key === 'added_sugar') {
    const w = p.weight_kg ?? p.start_weight_kg;
    const share = p.height_cm > 0 && bmi(w, p.height_cm) >= 25 ? ADDED_SUGAR_SHARE_OVERWEIGHT : ADDED_SUGAR_SHARE;
    return (share * p.kcal_goal) / 4;
  }
  if (def.key === 'sat_fat') return (SAT_FAT_SHARE * p.kcal_goal) / 9;
  const n = NORMS[def.key];
  return n == null ? def.dv : pickNorm(n, p.sex, ageFrom(p.birth_date));
}

export function pctDV(def: NutrientDef, value: number | undefined, p?: NormProfile | null): number {
  const dv = dvFor(def, p);
  return dv > 0 ? ((value ?? 0) / dv) * 100 : 0;
}

/** How many vitamins and minerals reach ~80% of the daily value. */
export function microsScore(m: Micros, p?: NormProfile | null): { ok: number; total: number } {
  const defs = NUTRIENTS.filter((d) => d.group !== 'other' && !d.limit);
  return { ok: defs.filter((d) => pctDV(d, m[d.key], p) >= 80).length, total: defs.length };
}

/** Which diary foods gave a nutrient over a period: amount per food name, biggest first. */
export async function nutrientSources(db: SQLiteDatabase, key: NutrientKey, from: string, to: string): Promise<{ name: string; amount: number; grams: number }[]> {
  const rows = await db.getAllAsync<Row & { entry_name: string }>(
    `select e.name as entry_name, e.date, e.grams, f.name, f.category, f.micros, f.kcal, f.protein, f.carbs, f.fat, f.sugar, f.fiber, f.salt
     from diary_entries e join foods f on f.id = e.food_id
     where e.date between ? and ? and e.grams is not null`,
    from,
    to,
  );
  const by = new Map<string, { name: string; amount: number; grams: number }>();
  for (const r of rows) {
    const v = ((microsPer100(r).values[key] ?? 0) * r.grams) / 100;
    const cur = by.get(r.entry_name) ?? { name: r.entry_name, amount: 0, grams: 0 };
    cur.amount += v;
    cur.grams += r.grams;
    by.set(r.entry_name, cur);
  }
  return [...by.values()].filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
}

/** Foods rich in a nutrient among the built-in, own and already used ones: per 100 g and per 100 kcal. */
export async function richFoods(db: SQLiteDatabase, key: NutrientKey, limit = 15) {
  const rows = await db.getAllAsync<FoodLike & { id: string }>(
    `select id, name, category, micros, kcal, protein, carbs, fat, sugar, fiber, salt from foods
     where deleted = 0 and kcal > 0 and (source != 'off' or use_count > 0)`,
  );
  return rows
    .map((f) => {
      const per100 = microsPer100(f).values[key] ?? 0;
      return { id: f.id, name: f.name, per100, per100kcal: (per100 / f.kcal) * 100 };
    })
    .filter((x) => x.per100 > 0)
    .sort((a, b) => b.per100 - a.per100)
    .slice(0, limit);
}
