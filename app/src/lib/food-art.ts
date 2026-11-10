// Which picture a food gets: by its category (stored or guessed from the name), refined by the name.
// Pure module (no React), so it can be checked from tools/.
import type { CategoryKey } from '@/data/micro-ref';
import { guessCategory } from '@/lib/micros';
import type { MealType } from '@/lib/nutrition';
import type { ArtKey } from '@/ui/art-data';

const CATEGORY_ART: Record<CategoryKey, ArtKey> = {
  grains_cooked: 'porridge', grains_dry: 'wheat', pasta: 'pasta', legumes: 'peas', bread: 'bread', bakery: 'cookie',
  potato: 'potato', red_meat: 'steak', poultry: 'drumstick', processed_meat: 'sausage', liver: 'liver',
  fatty_fish: 'salmon', lean_fish: 'fish', seafood: 'shrimp', eggs: 'egg', milk: 'milk', sweet_dairy: 'icecream',
  cottage_cheese: 'curd', cheese: 'cheese', cream: 'sourcream', butter: 'butter', oils: 'oil', sauces: 'sauce',
  leafy: 'leaf', vegetables: 'carrot', pickles: 'pickles', mushrooms: 'mushroom', avocado_olives: 'avocado',
  citrus: 'orange', fruits: 'apple', berries: 'strawberry', dried_fruit: 'date', nuts_seeds: 'nut', sweets: 'candy',
  sweet_drinks: 'juice', drinks: 'cup', alcohol: 'wine', mixed_dish: 'plate',
};

// JS `\b` is ASCII-only, so Cyrillic word ends use (?![а-яё]).
// Dishes first: the category classifier keys on an ingredient («суп куриный» → poultry), the picture should show the dish.
const BY_NAME: [RegExp, ArtKey][] = [
  [/(^|[^а-яё])суп(а|ы|ом|чик)?(?![а-яё])|борщ|(^|[^а-яё])щи(?![а-яё])|солянк|рассольник|бульон|(^|[^а-яё])уха(?![а-яё])|окрошк|soup|broth/, 'soup'],
  [/салат(?! лист)|винегрет|оливье|salad/, 'salad'],
  [/пицц|pizza/, 'pizza'],
  [/бургер|шаурм|сэндвич|бутерброд|burger|sandwich/, 'burger'],
  [/пельмен|вареник|манты|хинкал|dumpling/, 'dumplings'],
  [/спагетти|болоньез|лазань|spaghetti|lasagn/, 'pasta'],
  [/картоф.*пюре|пюре.*картоф/, 'potato'],
  [/плов|ризотто|каша(?![а-яё])|овсянк|risotto|porridge/, 'porridge'],
  [/блин|оладь|сырник|pancake/, 'pancakes'],
  [/яйцо|яйца(?![а-яё])|яиц(?![а-яё])|яичниц|омлет|(^|[^a-z])eggs?(?![a-z])|omelet/, 'egg'],
  [/руккол|arugula/, 'leaf'],
  [/капучино|латте|эспрессо|американо|cappuccino|latte/, 'cup'],
  [/квас(?![а-яё])/, 'juice'],
  [/батончик|snickers|twix|bounty|kitkat|kit kat/, 'chocolate'],
];

// A more specific picture inside a category.
const SPECIFIC: Partial<Record<CategoryKey, [RegExp, ArtKey][]>> = {
  vegetables: [
    [/помидор|томат|tomato/, 'tomato'],
    [/огур|cucumber/, 'cucumber'],
    [/брокколи|капуст|broccoli|cabbage|cauliflower/, 'broccoli'],
  ],
  fruits: [[/банан|banana/, 'banana']],
  potato: [[/фри(?![а-яё])|чипс|fries|chips/, 'fries']],
  sweets: [[/шоколад|chocolate|nutella/, 'chocolate']],
  drinks: [[/вода(?![а-яё])|воды(?![а-яё])|минерал|water/, 'water']],
};

const cache = new Map<string, ArtKey>();

/** Picture for a food: its stored category (or one guessed from the name), refined by the name. */
export function artFor(name: string, category?: string | null): ArtKey {
  const key = `${category ?? ''}|${name}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const n = name.toLowerCase().replace(/ё/g, 'е');
  const cat = (category && category in CATEGORY_ART ? category : guessCategory(name)) as CategoryKey;
  const art = BY_NAME.find(([re]) => re.test(n))?.[1] ?? SPECIFIC[cat]?.find(([re]) => re.test(n))?.[1] ?? CATEGORY_ART[cat];
  if (cache.size > 2000) cache.clear();
  cache.set(key, art);
  return art;
}

export const MEAL_ART: Record<MealType, ArtKey> = { breakfast: 'sunrise', lunch: 'soup', dinner: 'moon', snack: 'apple' };
