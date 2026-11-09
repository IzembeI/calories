// Разбор кодов маркировки «Честный ЗНАК» (GS1 DataMatrix).
// Код начинается с AI 01 и 14 цифр GTIN; дальше серийный номер (AI 21) и
// криптохвост (AI 91/92/93) — их не читаем. Без зависимостей: файл гоняется
// тестом tools/gs1-test.mjs прямо в node.

/** Проверка контрольной цифры GS1 (EAN-8/13, UPC-A, GTIN-14). */
export function gs1CheckDigitOk(code: string): boolean {
  if (!/^\d{8,14}$/.test(code)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  let sum = 0;
  // Справа налево: первая цифра перед контрольной умножается на 3.
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

/** GTIN-14 → привычный штрихкод с упаковки (EAN-13, а для EAN-8 — 8 цифр). */
export function gtin14ToEan(gtin: string): string {
  if (gtin.startsWith('000000')) return gtin.slice(6);
  if (gtin.startsWith('0')) return gtin.slice(1);
  return gtin;
}

/**
 * Достаёт штрихкод товара из DataMatrix. Возвращает null, если это не код GS1
 * (например, обычный DataMatrix с текстом или ссылкой).
 */
export function parseDataMatrix(data: string): string | null {
  let s = data.trim();
  if (s.startsWith(']d2')) s = s.slice(3); // символьный префикс (на iOS обычно не приходит)
  if (s.startsWith('\x1d')) s = s.slice(1); // FNC1 в начале
  const m = /^01(\d{14})/.exec(s);
  if (!m || !gs1CheckDigitOk(m[1])) return null;
  return gtin14ToEan(m[1]);
}

/**
 * Приводит результат сканера к штрихкоду для поиска.
 * Для DataMatrix — GTIN из кода маркировки или null; для остальных типов — как есть.
 */
export function normalizeScan(type: string, data: string): string | null {
  // На iOS тип может прийти как 'datamatrix' или 'org.iso.DataMatrix'.
  if (type.toLowerCase().replace(/[^a-z]/g, '').includes('datamatrix')) return parseDataMatrix(data);
  return data;
}
