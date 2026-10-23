import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lumpsumSchedule, sipForGoal, sipSchedule } from '../lib/calc.ts';
import { downsample, navMetrics, parseMfapi, trailingReturns } from '../lib/mfmath.ts';
import { isTriggered, validAlert } from '../lib/alerts.ts';

test('SIP matches closed-form annuity-due formula', () => {
  const rows = sipSchedule(10000, 12, 10);
  const i = 0.01, n = 120;
  assert.ok(Math.abs(rows.at(-1)!.value - 10000 * (((1 + i) ** n - 1) / i) * (1 + i)) < 1e-4);
  assert.equal(rows.at(-1)!.invested, 1_200_000); assert.equal(rows.length, 10);
});
test('SIP step-up, lumpsum and goal SIP', () => {
  const r = sipSchedule(1000, 0, 2, 10);
  assert.equal(r[1].invested, 12000 + 12 * 1100);
  assert.ok(Math.abs(lumpsumSchedule(100000, 10, 3).at(-1)!.value - 133100) < 1e-6);
  assert.ok(Math.abs(sipSchedule(sipForGoal(1_000_000, 12, 5), 12, 5).at(-1)!.value - 1_000_000) < 1e-3);
});
test('mfapi parse + returns + downsample', () => {
  const data: { date: string; nav: string }[] = [];
  const end = Date.UTC(2025, 9, 17);
  for (let d = 0; d <= 365 * 6; d++) { const dt = new Date(end - d * 86400_000); data.push({ date: `${String(dt.getUTCDate()).padStart(2, '0')}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${dt.getUTCFullYear()}`, nav: (100 * 1.1 ** (-d / 365)).toFixed(6) }); }
  const { points } = parseMfapi({ meta: { scheme_name: 'X' }, data });
  assert.ok(points[0][0] < points.at(-1)![0]);
  assert.ok(Math.abs(trailingReturns(points).y3! - 10) < 0.3);
  assert.throws(() => parseMfapi({ data: [] }));
  assert.ok(downsample(points, 100).length <= 101);
  assert.ok(Math.abs(navMetrics(points).y1! - 10) < 0.3);
});
test('alert conditions', () => {
  assert.equal(isTriggered({ cond: 'above', value: 100 }, 100, null), true);
  assert.equal(isTriggered({ cond: 'pct_down', value: 2 }, 1, -2.5), true);
  assert.equal(validAlert({ id: 'a', inst: 'x', cond: 'bad', value: 1, created: 1 }), false);
});
