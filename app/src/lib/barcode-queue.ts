// «Уточнить позже»: barcodes scanned while Open Food Facts could not be reached (no mobile internet,
// blocked without VPN). The diary tries them again quietly when it opens, one per visit.
import type { SQLiteDatabase } from 'expo-sqlite';
import { getFoodByBarcode, getSetting, saveFood, setSetting, type FoodRow, getFood } from '@/db/repo';
import { addDays, todayKey } from './dates';
import { OffError, offByBarcode } from './off';

interface Queued { code: string; added: string }
const KEY = 'barcode_queue';
const KEEP_DAYS = 30;
const MAX = 30;

export async function queueBarcode(db: SQLiteDatabase, code: string): Promise<void> {
  const q = await getSetting<Queued[]>(db, KEY, []);
  if (q.some((x) => x.code === code)) return;
  await setSetting(db, KEY, [...q, { code, added: todayKey() }].slice(-MAX));
}

export async function queuedCount(db: SQLiteDatabase): Promise<number> {
  return (await getSetting<Queued[]>(db, KEY, [])).length;
}

let busy = false;

/**
 * Tries the oldest queued barcode. Returns the product when it is found now, null otherwise.
 * A network failure leaves the queue untouched; «not in the database» and old entries are dropped.
 */
export async function retryQueuedBarcode(db: SQLiteDatabase): Promise<FoodRow | null> {
  if (busy) return null;
  busy = true;
  try {
    const q = (await getSetting<Queued[]>(db, KEY, [])).filter((x) => x.added >= addDays(todayKey(), -KEEP_DAYS));
    const first = q[0];
    if (!first) return null;
    const drop = () => setSetting(db, KEY, q.slice(1));
    const local = await getFoodByBarcode(db, first.code);
    if (local) {
      await drop();
      return null; // the user has created it by hand meanwhile
    }
    try {
      const f = await offByBarcode(first.code);
      await drop();
      return f ? await getFood(db, await saveFood(db, f)) : null;
    } catch (e) {
      if (!(e instanceof OffError) || (e.kind !== 'network' && e.kind !== 'rate')) await drop();
      return null;
    }
  } finally {
    busy = false;
  }
}
