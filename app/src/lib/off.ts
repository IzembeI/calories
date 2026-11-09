// Open Food Facts public API (read-only). Limits: ~15 product reads/min, ~10 searches/min per IP,
// so search only on explicit submit, never as-you-type.
import type { FoodInput, Serving } from '@/db/repo';

const UA = 'Kalorii/1.0 (personal iOS app)';
const FIELDS = 'code,product_name,product_name_ru,generic_name_ru,brands,nutriments,serving_size,serving_quantity,quantity';
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
  return {
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

export async function offSearch(q: string): Promise<FoodInput[]> {
  const query = q.trim();
  if (!query) return [];
  let products: any[] = [];
  try {
    // Search-a-licious (new full-text search)
    const d = await getJson(
      `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&langs=ru,en&page_size=25&fields=${FIELDS}`,
    );
    products = Array.isArray(d?.hits) ? d.hits : [];
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
  const out: FoodInput[] = [];
  for (const p of products) {
    const f = mapProduct(p);
    if (!f) continue;
    const key = f.barcode ?? `${f.name}|${f.brand}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}
