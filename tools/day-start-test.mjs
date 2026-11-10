// Edges of «Начало дня».  Usage: node tools/day-start-test.mjs   (Node 22.6+)
import assert from 'node:assert/strict';
import { setDayStartHour, todayKey } from '../app/src/lib/dates.ts';

const at = (h, m) => new Date(2026, 10, 10, h, m);
setDayStartHour(0);
assert.equal(todayKey(at(0, 0)), '2026-11-10');
assert.equal(todayKey(at(23, 59)), '2026-11-10');
setDayStartHour(4);
assert.equal(todayKey(at(1, 30)), '2026-11-09');
assert.equal(todayKey(at(3, 59)), '2026-11-09');
assert.equal(todayKey(at(4, 0)), '2026-11-10');
assert.equal(todayKey(new Date(2027, 0, 1, 2, 0)), '2026-12-31');
setDayStartHour(99);
assert.equal(todayKey(at(5, 59)), '2026-11-09'); // clamped to 6
console.log('day start: ok');
