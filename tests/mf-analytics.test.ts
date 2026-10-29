import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarYears, computeAnalytics, maxDrawdown, monthStats, rankIn, rolling, sip, windowStats, xirr } from '../lib/mf/analytics.ts';
import type { NavRow } from '../lib/mf/calc.ts';

const DAY = 86400_000;
// every calendar day, NAV grows exactly g per year (compounded)
const growth = (g: number, days: number, end = '2025-10-17'): NavRow[] => {
  const e = Date.parse(`${end}T00:00:00Z`);
  return Array.from({ length: days + 1 }, (_, i) => { const t = e - (days - i) * DAY; return { date: new Date(t).toISOString().slice(0, 10), nav: 100 * (1 + g) ** ((t - (e - days * DAY)) / (365 * DAY)) }; });
};
// trading-day series (Mon-Fri) with alternating +1% / -1% moves
const zigzag = (n: number, end = '2025-10-17'): NavRow[] => {
  const out: NavRow[] = []; let t = Date.parse(`${end}T00:00:00Z`);
  const dates: number[] = [];
  while (dates.length < n) { const wd = new Date(t).getUTCDay(); if (wd !== 0 && wd !== 6) dates.push(t); t -= DAY; }
  dates.reverse(); let nav = 100;
  dates.forEach((d, i) => { if (i > 0) nav *= i % 2 ? 1.01 : 0.99; out.push({ date: new Date(d).toISOString().slice(0, 10), nav }); });
  return out;
};

test('max drawdown: depth, peak/trough/recovery and current drawdown', () => {
  const rows: NavRow[] = [100, 120, 90, 110, 130, 100].map((nav, i) => ({ date: `2025-01-0${i + 1}`, nav }));
  const { mdd, current } = maxDrawdown(rows);
  assert.ok(Math.abs(mdd!.pct - -25) < 1e-9); assert.equal(mdd!.peak, '2025-01-02'); assert.equal(mdd!.trough, '2025-01-03'); assert.equal(mdd!.recovery, '2025-01-05');
  assert.ok(Math.abs(current!.pct - (100 / 130 - 1) * 100) < 1e-9);
  const up = maxDrawdown([1, 2, 3].map((nav, i) => ({ date: `2025-01-0${i + 1}`, nav })));
  assert.equal(up.mdd!.pct, 0);
  assert.equal(maxDrawdown([{ date: '2025-01-01', nav: 1 }, { date: '2025-01-02', nav: 0.5 }]).mdd!.recovery, null); // not recovered
});

test('constant growth: CAGR exact, vol ~0, rolling 1Y = growth, SIP XIRR = growth', () => {
  const rows = growth(0.12, 365 * 5 + 40);
  const w = windowStats(rows, 3, 6)!;
  assert.ok(Math.abs(w.cagr - 12) < 0.05, String(w.cagr)); assert.ok(w.vol! < 0.01); assert.equal(w.mdd!.pct, 0);
  const r = rolling(rows, 1).stats!;
  assert.ok(Math.abs(r.median - 12) < 0.05 && Math.abs(r.min - 12) < 0.1 && Math.abs(r.max - 12) < 0.1); assert.equal(r.posPct, 100); assert.equal(r.ge10Pct, 100);
  const r3 = rolling(rows, 3).stats!;
  assert.ok(Math.abs(r3.median - 12) < 0.05);
  for (const m of [12, 36, 60]) { const s = sip(rows, m)!; assert.ok(Math.abs(s.xirr! - 12) < 0.1, `${m}: ${s.xirr}`); assert.equal(s.invested, 10000 * m); assert.ok(s.value > s.invested); }
});

test('zigzag +1%/-1%: known volatility, Sharpe sign, Sortino defined', () => {
  const rows = zigzag(800);
  const w = windowStats(rows, 3, 6)!;
  // |r| ~1% each day -> daily sd ~1% -> annual ~ 1% x sqrt(~252)
  assert.ok(w.vol! > 14 && w.vol! < 18, String(w.vol));
  assert.ok(w.sharpe! < 0); // CAGR ~ -0.005%/day... below 6% rf
  assert.ok(w.sortino! < 0);
  assert.equal(windowStats(rows, 3, null)!.sharpe, null); // risk-free set nathi -> Sharpe nahi
  assert.equal(windowStats(zigzag(100), 3, 6), null); // history poori nathi
});

test('rolling needs full window; calendar years and months', () => {
  assert.equal(rolling(growth(0.1, 300), 1).stats, null);
  const rows: NavRow[] = [
    { date: '2023-06-30', nav: 100 }, { date: '2023-12-29', nav: 110 }, { date: '2024-12-31', nav: 121 }, { date: '2025-06-30', nav: 133.1 }, { date: '2025-10-17', nav: 145 },
  ];
  const cy = calendarYears(rows);
  assert.deepEqual(cy.map((c) => [c.year, c.partial, c.ytd]), [[2023, true, false], [2024, false, false], [2025, false, true]]);
  assert.ok(Math.abs(cy[0].ret - 10) < 1e-9); assert.ok(Math.abs(cy[1].ret - 10) < 1e-9); assert.ok(Math.abs(cy[2].ret - (145 / 121 - 1) * 100) < 1e-9);
  const m = monthStats(growth(0.12, 800))!;
  assert.equal(m.posPct, 100); assert.ok(m.best.ret > 0.5 && m.best.ret < 1.5);
  assert.equal(monthStats(growth(0.12, 60)), null);
});

test('XIRR known cases and failure modes', () => {
  const t0 = Date.parse('2024-01-01T00:00:00Z');
  assert.ok(Math.abs(xirr([{ t: t0, amt: -100 }, { t: t0 + 365 * DAY, amt: 110 }])! - 10) < 1e-6);
  assert.equal(xirr([{ t: t0, amt: -100 }, { t: t0 + DAY, amt: -5 }]), null); // no inflow
  const rows = growth(0.1, 365);
  assert.equal(sip(rows, 36), null); // 3Y SIP ne 3Y history joie
});

test('computeAnalytics assembles everything; null for short history', () => {
  const a = computeAnalytics(growth(0.12, 365 * 5 + 60), { rfPct: 6, series: true })!;
  assert.ok(a.windows['5y'] && a.windows['3y'] && a.windows['1y']); assert.ok(a.rolling['1y'] && a.rolling['3y']); assert.ok(a.rollingSeries1y.length > 100 && a.rollingSeries1y.length <= 300);
  assert.equal(a.calmar3y, null); // drawdown 0 -> Calmar nathi
  assert.equal(computeAnalytics(growth(0.1, 10), { rfPct: 6 }), null);
  assert.equal(computeAnalytics(growth(0.12, 365 * 2), { rfPct: null })!.windows['3y'], null);
});

test('rank, quartile, average and median in a peer group', () => {
  const peers = [10, 12, 8, 15, 9, 11, 14, 7];
  const r = rankIn(peers, 12);
  assert.equal(r.rank, 3); assert.equal(r.total, 8); assert.equal(r.quartile, 2); assert.ok(Math.abs(r.avg! - 10.75) < 1e-9); assert.equal(r.median, 10.5);
  assert.equal(rankIn(peers, 15).rank, 1); assert.equal(rankIn(peers, 15).quartile, 1); assert.equal(rankIn(peers, 7).quartile, 4);
  assert.equal(rankIn(peers, 7, false).rank, 1); // lower is better (volatility)
});
