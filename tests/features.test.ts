import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lumpsumSchedule, sipForGoal, sipSchedule } from '../lib/calc.ts';
import { amfiDate, parseNavAll, searchFunds } from '../lib/amfi.ts';
import { downsample, parseMfapi, trailingReturns } from '../lib/mfmath.ts';
import { isTriggered, validAlert } from '../lib/alerts.ts';

test('SIP matches closed-form annuity-due formula', () => {
  const rows = sipSchedule(10000, 12, 10);
  const i = 0.01, n = 120;
  const expected = 10000 * (((1 + i) ** n - 1) / i) * (1 + i);
  assert.ok(Math.abs(rows.at(-1)!.value - expected) < 1e-4);
  assert.equal(rows.at(-1)!.invested, 1_200_000);
  assert.equal(rows.length, 10);
});

test('SIP step-up raises SIP each year', () => {
  const rows = sipSchedule(1000, 0, 2, 10);
  assert.equal(rows[0].invested, 12000);
  assert.equal(rows[1].invested, 12000 + 12 * 1100);
  assert.ok(Math.abs(rows[1].value - rows[1].invested) < 1e-9); // 0% return
});

test('lumpsum and goal SIP', () => {
  assert.ok(Math.abs(lumpsumSchedule(100000, 10, 3).at(-1)!.value - 133100) < 1e-6);
  const sip = sipForGoal(1_000_000, 12, 5);
  assert.ok(Math.abs(sipSchedule(sip, 12, 5).at(-1)!.value - 1_000_000) < 1e-3);
  assert.ok(Math.abs(sipForGoal(1200, 0, 1) - 100) < 1e-9);
});

const NAV = `Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Flexi Cap Fund)

Alpha Mutual Fund

100001;INF1;-;Alpha Flexi Cap Fund - Direct Plan - Growth;123.4567;17-Oct-2025
100002;INF2;-;Alpha Flexi Cap Fund - Regular Plan - IDCW;50.1;17-Oct-2025
100003;INF3;-;Alpha Old Fund - Direct Plan - Growth;10;01-Jan-2020
100004;INF4;-;Alpha NA Fund;N.A.;17-Oct-2025

Open Ended Schemes(Debt Scheme - Liquid Fund)

Beta Mutual Fund

200001;INF5;-;Beta Liquid Fund - Direct Plan - Growth;1500.25;16-Oct-2025
`;

test('AMFI parse: category, amc, skips N.A. and bad rows', () => {
  const f = parseNavAll(NAV);
  assert.equal(f.length, 4);
  assert.equal(f[0].category, 'Equity Scheme - Flexi Cap Fund');
  assert.equal(f[0].amc, 'Alpha Mutual Fund');
  assert.equal(f[3].amc, 'Beta Mutual Fund');
  assert.equal(f[0].date, '2025-10-17');
  assert.equal(amfiDate('7-Mar-2024'), '2024-03-07');
  assert.equal(amfiDate('garbage'), null);
});

test('AMFI search: tokens, plan/option filters, inactive hidden', () => {
  const f = parseNavAll(NAV);
  const q = (s: string, o = {}) => searchFunds(f, '2025-10-17', s, o).map((x) => x.code);
  assert.deepEqual(q('alpha flexi'), ['100001', '100002']);
  assert.deepEqual(q('alpha', { plan: 'direct', option: 'growth' }), ['100001']);
  assert.deepEqual(q('alpha', { option: 'idcw' }), ['100002']);
  assert.deepEqual(q('alpha', { plan: 'regular' }), ['100002']);
  assert.deepEqual(q('old'), []);
  assert.deepEqual(q('old', { includeInactive: true }), ['100003']);
  assert.deepEqual(q('mutual fund beta'), ['200001']); // AMC name match
  assert.deepEqual(q(''), []);
});

test('mfapi parse + returns', () => {
  const data = [] as { date: string; nav: string }[];
  // daily NAV growing exactly 10% per year (365-day years approx), 6 years back from 2025-10-17
  const end = Date.UTC(2025, 9, 17);
  for (let d = 0; d <= 365 * 6; d++) {
    const t = end - d * 86400_000;
    const dt = new Date(t);
    data.push({ date: `${String(dt.getUTCDate()).padStart(2, '0')}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${dt.getUTCFullYear()}`, nav: (100 * 1.1 ** (-d / 365)).toFixed(6) });
  }
  const { points } = parseMfapi({ meta: { scheme_name: 'X' }, data });
  assert.ok(points[0][0] < points.at(-1)![0]);
  const r = trailingReturns(points);
  assert.ok(Math.abs(r.y1! - 10) < 0.3, String(r.y1));
  assert.ok(Math.abs(r.y3! - 10) < 0.3);
  assert.ok(Math.abs(r.y5! - 10) < 0.3);
  assert.ok(r.m1! > 0.5 && r.m1! < 1.2);
  assert.ok(Math.abs(r.inception! - 10) < 0.3);
  assert.throws(() => parseMfapi({ data: [] }));
  assert.ok(downsample(points, 100).length <= 101);
  assert.equal(downsample(points, 100).at(-1), points.at(-1));
});

test('returns null when history is short', () => {
  const pts: [number, number][] = [[Date.UTC(2025, 9, 1), 10], [Date.UTC(2025, 9, 17), 10.5]];
  const r = trailingReturns(pts);
  assert.equal(r.y1, null); assert.equal(r.y5, null); assert.equal(r.inception, null);
});

test('alert conditions', () => {
  assert.equal(isTriggered({ cond: 'above', value: 100 }, 100, null), true);
  assert.equal(isTriggered({ cond: 'above', value: 100 }, 99.9, null), false);
  assert.equal(isTriggered({ cond: 'below', value: 50 }, 50, null), true);
  assert.equal(isTriggered({ cond: 'pct_up', value: 2 }, 1, 2.1), true);
  assert.equal(isTriggered({ cond: 'pct_up', value: 2 }, 1, null), false);
  assert.equal(isTriggered({ cond: 'pct_down', value: 2 }, 1, -2.5), true);
  assert.equal(isTriggered({ cond: 'pct_down', value: 2 }, 1, -1), false);
  assert.equal(validAlert({ id: 'a', inst: 'x', cond: 'above', value: 1, created: 1 }), true);
  assert.equal(validAlert({ id: 'a', inst: 'x', cond: 'bad', value: 1, created: 1 }), false);
});
