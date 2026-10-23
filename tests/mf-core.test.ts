import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amfiDate, classifyOption, classifyPlan, parseCategoryHeader, parseNavAllFull, slugify } from '../lib/mf/classify.ts';
import { computeReturns, expectedNavDate, istDate, median, navAtOrBefore, oneDay, subtractMonths, summarize, validateChange, isStale } from '../lib/mf/calc.ts';

const FILE = `Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date

Open Ended Schemes(Equity Scheme - Large Cap Fund)

Alpha Mutual Fund

100001;INF000A01011;-;Alpha Large Cap Fund - Regular Plan - Growth;123.4567;17-Oct-2025
100002;INF000A01029;INF000A01037;Alpha Large Cap Fund - Regular Plan - IDCW;50.1;17-Oct-2025
100003;-;-;Alpha Large Cap Fund - Direct Plan - Growth;130;17-Oct-2025
100004;INF000A01045;-;Alpha NA Fund;N.A.;17-Oct-2025
abc;INF;-;bad;1;17-Oct-2025

Close Ended Schemes(Debt Scheme - Fixed Term Plan)

Beta Mutual Fund

200001;INF000B01011;-;Beta FTP Series 5 - Regular Plan - Growth;11.5;16-Oct-2025
`;

test('AMFI file parse: categories, AMC, ISIN, skips bad rows', () => {
  const { rows, skipped } = parseNavAllFull(FILE);
  assert.equal(rows.length, 4); assert.equal(skipped, 2);
  assert.equal(rows[0].amc, 'Alpha Mutual Fund'); assert.equal(rows[0].main, 'Equity Scheme'); assert.equal(rows[0].sub, 'Large Cap Fund');
  assert.equal(rows[0].categorySlug, 'equity-scheme-large-cap-fund'); assert.equal(rows[0].isinA, 'INF000A01011'); assert.equal(rows[2].isinA, null);
  assert.equal(rows[3].amc, 'Beta Mutual Fund'); assert.equal(rows[3].schemeType, 'Close Ended'); assert.equal(rows[3].date, '2025-10-16');
});

test('category header variants', () => {
  assert.deepEqual(parseCategoryHeader('Interval Fund Schemes(Income)')?.sub, 'Income');
  assert.equal(parseCategoryHeader('Open Ended Schemes ( Other Scheme - Index Funds )')?.category, 'Other Scheme - Index Funds');
  assert.equal(parseCategoryHeader('Alpha Mutual Fund'), null);
});

test('plan / option / slug / date', () => {
  assert.equal(classifyPlan('X - Direct Plan - Growth'), 'Direct'); assert.equal(classifyPlan('X - Regular Plan - Growth'), 'Regular');
  assert.equal(classifyOption('X - IDCW Payout'), 'IDCW'); assert.equal(classifyOption('X - Growth'), 'Growth'); assert.equal(classifyOption('X Bonus'), 'Bonus'); assert.equal(classifyOption('X'), 'Other');
  assert.equal(slugify('Other Scheme - Index Funds & ETFs'), 'other-scheme-index-funds-and-etfs');
  assert.equal(amfiDate('7-Mar-2024'), '2024-03-07'); assert.equal(amfiDate('31-Feb-2024'), null);
});

test('1D change uses previous AVAILABLE NAV (weekend / holiday)', () => {
  const r = oneDay([{ date: '2025-10-16', nav: 100 }, { date: '2025-10-17', nav: 101 }, { date: '2025-10-20', nav: 103.02 }]); // Fri -> Mon
  assert.equal(r!.prevDate, '2025-10-17'); assert.equal(r!.date, '2025-10-20'); assert.ok(Math.abs(r!.pct - 2) < 1e-9);
  assert.equal(oneDay([{ date: '2025-10-20', nav: 1 }]), null);
});

test('returns: absolute <1Y, CAGR 3Y/5Y, null when data missing', () => {
  const rows: { date: string; nav: number }[] = [];
  const end = Date.UTC(2025, 9, 17);
  for (let d = 365 * 5 + 30; d >= 0; d--) { const t = new Date(end - d * 86400_000); if (t.getUTCDay() % 6 === 0) continue; rows.push({ date: t.toISOString().slice(0, 10), nav: 100 * 1.1 ** (-d / 365) }); }
  const r = computeReturns(rows);
  assert.ok(Math.abs(r.r1y! - 10) < 0.2); assert.ok(Math.abs(r.r3y! - 10) < 0.2); assert.ok(Math.abs(r.r5y! - 10) < 0.2);
  assert.ok(r.r1m! > 0.6 && r.r1m! < 1.1); assert.ok(r.r6m! > 4 && r.r6m! < 5.5);
  const short = computeReturns([{ date: '2025-09-01', nav: 10 }, { date: '2025-10-17', nav: 10.5 }]);
  assert.equal(short.r1y, null); assert.equal(short.r5y, null); assert.equal(short.r3m, null);
  assert.equal(short.r1m, null); // 16 divas junu data 1M base mate vapray nahi (guess nahi)
  const ok = computeReturns([{ date: '2025-09-16', nav: 10 }, { date: '2025-10-17', nav: 10.5 }]);
  assert.ok(Math.abs(ok.r1m! - 5) < 1e-9);
});

test('date helpers', () => {
  assert.equal(subtractMonths('2025-03-31', 1), '2025-02-28'); assert.equal(subtractMonths('2025-01-15', 12), '2024-01-15'); assert.equal(subtractMonths('2025-10-17', 60), '2020-10-17');
  const rows = [{ date: '2025-10-10', nav: 1 }, { date: '2025-10-17', nav: 2 }];
  assert.equal(navAtOrBefore(rows, '2025-10-15')!.nav, 1); assert.equal(navAtOrBefore(rows, '2025-10-02'), null); assert.equal(navAtOrBefore(rows, '2025-10-30'), null);
  assert.equal(istDate(new Date('2025-10-17T19:00:00Z')), '2025-10-18'); // 00:30 IST next day
});

test('summary mean/median + 20% guard + stale', () => {
  const s = summarize([1, -2, 0, 3]);
  assert.equal(s.count, 4); assert.equal(s.avg, 0.5); assert.equal(s.median, 0.5); assert.equal(s.gainers, 2); assert.equal(s.losers, 1); assert.equal(s.unchanged, 1);
  assert.equal(median([3, 1, 2]), 2); assert.equal(median([]), null);
  assert.equal(validateChange(121, 100), 'review'); assert.equal(validateChange(79, 100), 'review'); assert.equal(validateChange(120, 100), 'ok'); assert.equal(validateChange(5, null), 'ok');
  assert.equal(isStale({ lastSuccessAt: Date.now() - 3600_000, lastJobFailed: false }), false);
  assert.equal(isStale({ lastSuccessAt: Date.now() - 40 * 3600_000, lastJobFailed: false }), true);
  assert.equal(isStale({ lastSuccessAt: Date.now(), lastJobFailed: true }), true);
  assert.equal(isStale({ lastSuccessAt: null, lastJobFailed: false }), true);
});

test('expected NAV date (IST): after 22:00 today; before = yesterday; weekend -> Friday', () => {
  assert.equal(expectedNavDate(new Date('2025-10-16T18:00:00Z')), '2025-10-16'); // Thu 23:30 IST
  assert.equal(expectedNavDate(new Date('2025-10-17T03:00:00Z')), '2025-10-16'); // Fri 08:30 IST -> Thu
  assert.equal(expectedNavDate(new Date('2025-10-18T18:00:00Z')), '2025-10-17'); // Sat 23:30 IST -> Fri
  assert.equal(expectedNavDate(new Date('2025-10-20T03:00:00Z')), '2025-10-17'); // Mon 08:30 IST -> Fri
});

import { adminConfigured, hashPassword, makeSession, verifyPassword, verifySession } from '../lib/mf/auth.ts';
test('admin auth: hash, plain env password, session tamper/expiry', () => {
  const h = hashPassword('correct-horse-battery');
  assert.equal(verifyPassword('correct-horse-battery', h), true); assert.equal(verifyPassword('wrong', h), false);
  delete process.env.ADMIN_PASSWORD_HASH; process.env.ADMIN_PASSWORD = 'plain-pass-123456'; process.env.ADMIN_USER = 'a'; process.env.SESSION_SECRET = 'x'.repeat(20);
  assert.equal(adminConfigured(), true); assert.equal(verifyPassword('plain-pass-123456'), true); assert.equal(verifyPassword('plain-pass-1234567'), false);
  process.env.ADMIN_PASSWORD = 'short'; assert.equal(verifyPassword('short'), false); assert.equal(adminConfigured(), false);
  const t = makeSession('alpesh', 1000);
  assert.equal(verifySession(t, 2000), 'alpesh'); assert.equal(verifySession(t, 1000 + 9 * 3600_000), null);
  assert.equal(verifySession(t.slice(0, -2) + 'aa', 2000), null); assert.equal(verifySession(undefined), null);
});
