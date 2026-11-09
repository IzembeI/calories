// Diary days are local calendar days stored as 'YYYY-MM-DD'. Never derive them from UTC.

const pad = (n: number) => String(n).padStart(2, '0');

export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): string {
  return toKey(new Date());
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86400000);
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** 0 = Monday */
export function weekdayIndex(key: string): number {
  return (fromKey(key).getDay() + 6) % 7;
}

export function weekStart(key: string): string {
  return addDays(key, -weekdayIndex(key));
}

export function monthName(monthIndex: number): string {
  return MONTHS[monthIndex];
}

export function formatDay(key: string, withYear = false): string {
  const d = fromKey(key);
  const s = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  return withYear ? `${s} ${d.getFullYear()}` : s;
}

export function formatShort(key: string): string {
  const d = fromKey(key);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function relativeDayTitle(key: string): string {
  const t = todayKey();
  if (key === t) return 'Сегодня';
  if (key === addDays(t, -1)) return 'Вчера';
  if (key === addDays(t, 1)) return 'Завтра';
  return formatDay(key, fromKey(key).getFullYear() !== new Date().getFullYear());
}

export function ageFrom(birthKey: string, at = todayKey()): number {
  const b = fromKey(birthKey);
  const a = fromKey(at);
  let age = a.getFullYear() - b.getFullYear();
  if (a.getMonth() < b.getMonth() || (a.getMonth() === b.getMonth() && a.getDate() < b.getDate())) age--;
  return age;
}

export function nowIso(): string {
  return new Date().toISOString();
}
