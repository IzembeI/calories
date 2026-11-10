// Open Food Facts public API (read-only). Limits: ~15 product reads/min, ~10 searches/min per IP,
// so search only on explicit submit, never as-you-type.
import type { FoodInput, Serving } from '@/db/repo';
import { guessCategory } from './micros';

const UA = 'Kalorii/1.0 (personal iOS app)';
const FIELDS = 'nutriscore_grade,code,product_name,product_name_ru,generic_name_ru,brands,nutriments,serving_size,serving_quantity,quantity';
const TIMEOUT_MS = 12000;

export class OffError extends Error {
  constructor(message: string, readonly kind: 'network' | 'rate' | 'notfound' | 'other') {
    super(message);
  }
}

async function getJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (res.status === 429 || res.status === 503) throw new OffError('Open Food Facts перегружен, попробуйте через минуту', 'rate');
    if (res.status === 404) throw new OffError('Не найдено', 'notfound');
    if (!res.ok) throw new OffError(`Ошибка Open Food Facts (${res.status})`, 'other');
    return await res.json();
  } catch (e) {
    if (e instanceof OffError) throw e;
    throw new OffError('Нет связи с Open Food Facts', 'network');
  } finally {
    clearTimeout(t);
  }
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

const text = (v: unknown): string => {
  if (typeof v === 'string') return v.trim();
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string').join(', ').trim();
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return text(o.ru ?? o.main ?? o.en ?? Object.values(o)[0]);
  }
  return '';
};

/** Map an OFF product to our food (per 100 g). Returns null when there is no energy value. */
export function mapProduct(p: any): FoodInput | null {
  if (!p) return null;
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null) {
    const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g']);
    if (kj != null) kcal = kj / 4.184;
  }
  if (kcal == null) return null;
  const name = text(p.product_name_ru) || text(p.product_name) || text(p.generic_name_ru) || 'Без названия';
  const brand = text(p.brands).split(',')[0]?.trim() || null;
  const servings: Serving[] = [];
  const sq = num(p.serving_quantity);
  if (sq && sq > 0 && sq < 2000) servings.push({ name: p.serving_size ? `порция (${text(p.serving_size)})` : 'порция', grams: sq });
  // "500 г", "100 гр", "250 мл", "1 л", "0,9 кг" → grams (ml treated as grams)
  const pack = /^(\d+(?:[.,]\d+)?)\s*(кг|kg|гр|г|g|мл|ml|л|l)(?![A-Za-zА-Яа-яЁё])/i.exec(text(p.quantity));
  const packGrams = pack ? (num(pack[1]) ?? 0) * (/^(кг|kg|л|l)$/i.test(pack[2]) ? 1000 : 1) : null;
  if (packGrams && packGrams > 0 && packGrams < 5000 && packGrams !== sq) servings.push({ name: `упаковка (${text(p.quantity)})`, grams: packGrams });
  const g = (key: string, factor: number) => {
    const v = num(n[`${key}_100g`]);
    return v == null ? undefined : v * factor;
  };
  const label: Record<string, number | undefined> = {
    vit_a: g('vitamin-a', 1e6), vit_c: g('vitamin-c', 1e3), vit_d: g('vitamin-d', 1e6), vit_e: g('vitamin-e', 1e3),
    vit_k: g('vitamin-k', 1e6), b1: g('vitamin-b1', 1e3), b2: g('vitamin-b2', 1e3), b3: g('vitamin-pp', 1e3),
    b6: g('vitamin-b6', 1e3), b9: g('folates', 1e6) ?? g('vitamin-b9', 1e6), b12: g('vitamin-b12', 1e6),
    ca: g('calcium', 1e3), fe: g('iron', 1e3), mg: g('magnesium', 1e3), p: g('phosphorus', 1e3), k: g('potassium', 1e3),
    zn: g('zinc', 1e3), se: g('selenium', 1e6), na: g('sodium', 1e3), chol: g('cholesterol', 1e3),
    added_sugar: g('added-sugars', 1), sat_fat: g('saturated-fat', 1),
  };
  const real = Object.fromEntries(Object.entries(label).filter(([, v]) => v != null));
  return {
    category: guessCategory(name),
    nutriscore: /^[a-e]$/.test(text(p.nutriscore_grade).toLowerCase()) ? text(p.nutriscore_grade).toLowerCase() : null,
    micros: Object.keys(real).length ? JSON.stringify(real) : null,
    source: 'off',
    barcode: text(p.code) || null,
    name,
    brand,
    kcal: Math.round(kcal * 10) / 10,
    protein: num(n.proteins_100g),
    fat: num(n.fat_100g),
    carbs: num(n.carbohydrates_100g),
    sugar: num(n.sugars_100g),
    fiber: num(n.fiber_100g),
    salt: num(n.salt_100g),
    servings,
  };
}

export async function offByBarcode(code: string): Promise<FoodInput | null> {
  const data = await getJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}?fields=${FIELDS}&lc=ru`);
  if (!data || data.status === 0 || !data.product) return null;
  return mapProduct({ code, ...data.product });
}

const SEARCH_FIELDS = `${FIELDS},countries_tags`;
const MIN_RU_HITS = 5;

const sal = async (q: string): Promise<any[]> => {
  const d = await getJson(
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&langs=ru,en&page_size=25&fields=${SEARCH_FIELDS}`,
  );
  return Array.isArray(d?.hits) ? d.hits : [];
};

const CYR = /[а-яё]/i;
/** 0 = Russian name, then products tagged as sold in Russia (or GS1 Russia 460–469 barcode). Lower is better. */
const ruRank = (p: any): number => {
  const cyr = CYR.test(text(p?.product_name_ru)) || CYR.test(text(p?.product_name));
  const tags: unknown = p?.countries_tags;
  const ru = (Array.isArray(tags) && tags.includes('en:russia')) || /^46\d/.test(text(p?.code));
  return (cyr ? 0 : 2) + (ru ? 0 : 1);
};

export async function offSearch(q: string): Promise<FoodInput[]> {
  const query = q.trim();
  if (!query) return [];
  let products: any[] = [];
  try {
    // Search-a-licious (new full-text search). Products sold in Russia first
    // (countries_tags filter checked against search.openfoodfacts.org), then the unfiltered search
    // only when that gives too few hits.
    const safe = query.replace(/["':()\\]/g, ' ').trim();
    if (safe) products = await sal(`${safe} countries_tags:"en:russia"`).catch((e) => {
      if (e instanceof OffError && e.kind === 'network') throw e;
      return [];
    });
    if (products.length < MIN_RU_HITS) products = [...products, ...(await sal(query))];
  } catch (e) {
    if (e instanceof OffError && e.kind === 'network') throw e;
  }
  if (!products.length) {
    // Legacy search
    const d = await getJson(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=25&lc=ru&fields=${FIELDS}`,
    );
    products = Array.isArray(d?.products) ? d.products : [];
  }
  const seen = new Set<string>();
  const out: { f: FoodInput; rank: number; i: number }[] = [];
  for (const p of products) {
    const f = mapProduct(p);
    if (!f) continue;
    const key = f.barcode ?? `${f.name}|${f.brand}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ f, rank: ruRank(p), i: out.length });
  }
  // Client-side rule is the main one: Cyrillic names first, then Russian products; keep API order inside.
  return out.sort((a, b) => a.rank - b.rank || a.i - b.i).map((x) => x.f);
}
