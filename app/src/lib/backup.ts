import type { SQLiteDatabase } from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { todayKey } from './dates';

const TABLES = ['profile', 'foods', 'meals', 'meal_items', 'diary_entries', 'water_entries', 'activity_entries', 'measurements', 'settings'] as const;
const FORMAT = 'kalorii-backup';

export async function exportBackup(db: SQLiteDatabase): Promise<void> {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    // builtin foods are re-seeded by the app; only keep them if the user touched them
    data[t] =
      t === 'foods'
        ? await db.getAllAsync(`select * from foods where source != 'builtin' or favourite = 1 or last_used_at is not null`)
        : await db.getAllAsync(`select * from ${t}`);
  }
  const json = JSON.stringify({ format: FORMAT, version: 1, created: new Date().toISOString(), data });
  const file = new File(Paths.cache, `kalorii-backup-${todayKey()}.json`);
  if (file.exists) file.delete();
  file.create();
  await file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Сохранить резервную копию' });
}

/** Returns the number of restored rows, or null if the user cancelled. Replaces all data. */
export async function importBackup(db: SQLiteDatabase): Promise<number | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', '*/*'], copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  const text = await new File(res.assets[0].uri).text();
  const parsed = JSON.parse(text);
  if (parsed?.format !== FORMAT || typeof parsed.data !== 'object') throw new Error('Это не резервная копия «Калорий»');
  let count = 0;
  await db.withTransactionAsync(async () => {
    for (const t of [...TABLES].reverse()) {
      if (t === 'foods') await db.runAsync(`delete from foods where source != 'builtin'`);
      else await db.runAsync(`delete from ${t}`);
    }
    for (const t of TABLES) {
      const rows = (parsed.data[t] ?? []) as Record<string, unknown>[];
      for (const r of rows) {
        const cols = Object.keys(r).filter((c) => /^[a-z_]+$/.test(c));
        if (!cols.length) continue;
        await db.runAsync(
          `insert or replace into ${t} (${cols.join(',')}) values (${cols.map(() => '?').join(',')})`,
          cols.map((c) => r[c] as string | number | null),
        );
        count++;
      }
    }
  });
  return count;
}
