// CSV export for Excel / Google Таблицы / a nutritionist. Pure JS: expo-file-system + expo-sharing.
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { dailyTotals, entriesBetween, measurementsBetween, type Profile } from '@/db/repo';
import { MEASUREMENTS } from './measurements';
import { mealTitle } from './nutrition';

/**
 * 'excel': ';' separator + decimal comma — what Excel with Russian regional settings expects.
 * 'universal': ',' separator + decimal point — Google Таблицы, Numbers, scripts.
 */
export type CsvDialect = 'excel' | 'universal';
export type CsvKind = 'entries' | 'days' | 'measurements';

type Cell = string | number | null | undefined;

const BOM = '﻿'; // lets Excel detect UTF-8, so Cyrillic is not garbled

function cell(v: Cell, d: CsvDialect, digits: number): string {
  if (v == null) return '';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    const s = String(Number(v.toFixed(digits)));
    return d === 'excel' ? s.replace('.', ',') : s;
  }
  let s = v;
  // Spreadsheet formula injection: a product name like "=1+2" must stay text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  const sep = d === 'excel' ? ';' : ',';
  return s.includes(sep) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** headers + rows → CSV text (CRLF line ends, BOM). `digits[i]` = decimals for numeric column i (default 1). */
export function toCsv(headers: string[], rows: Cell[][], d: CsvDialect, digits: number[] = []): string {
  const sep = d === 'excel' ? ';' : ',';
  const line = (r: Cell[]) => r.map((v, i) => cell(v, d, digits[i] ?? 1)).join(sep);
  return BOM + [headers.map((h) => cell(h, d, 0)).join(sep), ...rows.map(line)].join('\r\n') + '\r\n';
}

export async function entriesCsv(db: SQLiteDatabase, from: string, to: string, d: CsvDialect): Promise<{ text: string; rows: number }> {
  const rows = await entriesBetween(db, from, to);
  const text = toCsv(
    ['дата', 'приём', 'продукт', 'граммы', 'порция', 'ккал', 'белки', 'жиры', 'углеводы'],
    rows.map((e) => [e.date, mealTitle(e.meal_type), e.name, e.grams, e.serving_label, e.kcal, e.protein, e.fat, e.carbs]),
    d,
    [0, 0, 0, 0, 0, 0, 1, 1, 1],
  );
  return { text, rows: rows.length };
}

export async function daysCsv(db: SQLiteDatabase, p: Profile, from: string, to: string, d: CsvDialect): Promise<{ text: string; rows: number }> {
  const [totals, meas] = await Promise.all([dailyTotals(db, from, to), measurementsBetween(db, from, to)]);
  const weight = new Map(meas.filter((m) => m.type === 'weight').map((m) => [m.date, m.value]));
  const text = toCsv(
    ['дата', 'ккал', 'норма ккал', 'белки', 'жиры', 'углеводы', 'вес'],
    totals.map((t) => [t.date, t.kcal, p.kcal_goal, t.protein, t.fat, t.carbs, weight.get(t.date)]),
    d,
    [0, 0, 0, 1, 1, 1, 1],
  );
  return { text, rows: totals.length };
}

/** One row per date, one column per measurement type (вес;шея;грудь;бицепс;талия;ягодицы;бедро). */
export async function measurementsCsv(db: SQLiteDatabase, from: string, to: string, d: CsvDialect): Promise<{ text: string; rows: number }> {
  const rows = await measurementsBetween(db, from, to);
  const value = new Map(rows.map((r) => [`${r.date}|${r.type}`, r.value])); // ordered by date: last value of a day wins
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const text = toCsv(
    ['дата', ...MEASUREMENTS.map((m) => `${m.title.toLowerCase()}, ${m.unit}`)],
    dates.map((dt) => [dt, ...MEASUREMENTS.map((m) => value.get(`${dt}|${m.type}`))]),
    d,
  );
  return { text, rows: dates.length };
}

const FILE_NAME: Record<CsvKind, string> = { entries: 'zapisi', days: 'itogi', measurements: 'zamery' };

/** Builds one CSV file in the cache and opens the share sheet. Returns the number of data rows. */
export async function exportCsv(db: SQLiteDatabase, p: Profile, kind: CsvKind, from: string, to: string, d: CsvDialect): Promise<number> {
  const { text, rows } =
    kind === 'entries' ? await entriesCsv(db, from, to, d) : kind === 'days' ? await daysCsv(db, p, from, to, d) : await measurementsCsv(db, from, to, d);
  if (!rows) return 0;
  const file = new File(Paths.cache, `kalorii-${FILE_NAME[kind]}-${from}_${to}.csv`);
  if (file.exists) file.delete();
  file.create();
  await file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: 'Отправить CSV' });
  return rows;
}
