import type { SQLiteDatabase } from 'expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { getSetting, setSetting } from '@/db/repo';
import { diffDays, todayKey } from './dates';

const TABLES = ['profile', 'foods', 'meals', 'meal_items', 'diary_entries', 'water_entries', 'activity_entries', 'measurements', 'settings'] as const;
const FORMAT = 'kalorii-backup';

/** The whole backup as JSON text (the same format for manual and automatic copies). */
export async function buildBackupJson(db: SQLiteDatabase): Promise<string> {
  const data: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    // builtin foods are re-seeded by the app; only keep them if the user touched them (or corrected them)
    data[t] =
      t === 'foods'
        ? await db.getAllAsync(
            `select * from foods where source != 'builtin' or favourite = 1 or last_used_at is not null or edited = 1 or last_grams is not null`,
          )
        : await db.getAllAsync(`select * from ${t}`);
  }
  return JSON.stringify({ format: FORMAT, version: 1, created: new Date().toISOString(), data });
}

export async function exportBackup(db: SQLiteDatabase): Promise<void> {
  const json = await buildBackupJson(db);
  const file = new File(Paths.cache, `kalorii-backup-${todayKey()}.json`);
  if (file.exists) file.delete();
  file.create();
  await file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Сохранить резервную копию' });
  // The share sheet does not tell whether the file was really saved; closing it counts as a copy for the weekly reminder.
  await setSetting(db, 'last_manual_backup', todayKey());
}

// ---------- weekly automatic copy ----------
// Copies go to Documents/Backups, which the Files app shows under «На iPhone → Калории» (UIFileSharingEnabled +
// LSSupportsOpeningDocumentsInPlace in app.json). They live INSIDE the app container, so deleting the app deletes
// them too: the user still has to move a copy to iCloud Drive, and BackupNudge reminds about it weekly.

export const BACKUP_EVERY_DAYS = 7;
const AUTO_BACKUP_KEEP = 8;
const AUTO_NAME = /^kalorii-\d{4}-\d{2}-\d{2}\.json$/;
let autoRunning = false;

/** Writes Documents/Backups/kalorii-YYYY-MM-DD.json when the last automatic copy is a week old; keeps the 8 newest. */
export async function autoBackup(db: SQLiteDatabase): Promise<boolean> {
  if (autoRunning) return false;
  autoRunning = true;
  try {
    if (!(await getSetting<boolean>(db, 'auto_backup', true))) return false;
    const today = todayKey();
    const last = await getSetting<string | null>(db, 'last_auto_backup', null);
    if (last && diffDays(last, today) < BACKUP_EVERY_DAYS) return false;
    const json = await buildBackupJson(db);
    const dir = new Directory(Paths.document, 'Backups');
    dir.create({ intermediates: true, idempotent: true });
    const file = new File(dir, `kalorii-${today}.json`);
    if (file.exists) file.delete();
    file.create();
    await file.write(json);
    const old = dir
      .list()
      .filter((f): f is File => f instanceof File && AUTO_NAME.test(f.name))
      .sort((a, b) => (a.name < b.name ? 1 : -1))
      .slice(AUTO_BACKUP_KEEP);
    for (const f of old) {
      try {
        f.delete();
      } catch {
        // a file that is open in Files may be busy; it is removed next week
      }
    }
    await setSetting(db, 'last_auto_backup', today);
    return true;
  } finally {
    autoRunning = false;
  }
}

/** True when no copy was exported out of the app for a week and the reminder was not dismissed this week. */
export async function backupNudgeDue(db: SQLiteDatabase): Promise<boolean> {
  const today = todayKey();
  const manual = await getSetting<string | null>(db, 'last_manual_backup', null);
  const dismissed = await getSetting<string | null>(db, 'backup_nudge_dismissed', null);
  const last = [manual, dismissed].filter((x): x is string => !!x).sort().pop();
  if (!last) {
    // first run: give the user a week of data before the first reminder
    await setSetting(db, 'backup_nudge_dismissed', today);
    return false;
  }
  return diffDays(last, today) >= BACKUP_EVERY_DAYS;
}

export async function dismissBackupNudge(db: SQLiteDatabase): Promise<void> {
  await setSetting(db, 'backup_nudge_dismissed', todayKey());
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
        // backups made before kcal_mode only have kcal_auto
        if (t === 'profile' && r.kcal_mode == null && r.kcal_auto != null) r.kcal_mode = r.kcal_auto === 0 ? 'manual' : 'formula';
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
