// Проверка разбора кодов «Честный ЗНАК»: node tools/gs1-test.mjs
// (Node 22.18+ сам убирает типы из .ts; на старых — node --experimental-strip-types)
import assert from 'node:assert/strict';
import { gs1CheckDigitOk, normalizeScan, parseDataMatrix } from '../app/src/lib/gs1.ts';

const GS = '\x1d';
const cases = [
  // молочка: 01 + GTIN, 21 серия, GS, 93 криптоключ
  ['0104006381333931215Ab3cD' + GS + '93dGVz', '4006381333931'],
  // FNC1 в начале и префикс ]d2
  [GS + '0104006381333931215Ab3cD' + GS + '93dGVz', '4006381333931'],
  [']d20104006381333931215Ab3cD' + GS + '91EE06' + GS + '92abc', '4006381333931'],
  // EAN-8 внутри GTIN-14
  ['010000009638507421xyz', '96385074'],
  // неверная контрольная цифра
  ['0104006381333932215Ab3cD', null],
  // не GS1
  ['https://example.com/abc', null],
  ['21abc0104006381333931', null],
];
for (const [input, want] of cases) assert.equal(parseDataMatrix(input), want, JSON.stringify(input));

assert.equal(normalizeScan('datamatrix', cases[0][0]), '4006381333931');
assert.equal(normalizeScan('org.iso.DataMatrix', cases[0][0]), '4006381333931');
assert.equal(normalizeScan('ean13', '4006381333931'), '4006381333931');
assert.equal(normalizeScan('datamatrix', 'hello'), null);
assert.ok(gs1CheckDigitOk('4006381333931'));
assert.ok(gs1CheckDigitOk('96385074'));
assert.ok(!gs1CheckDigitOk('4006381333930'));
console.log('gs1: ok,', cases.length + 7, 'checks');
