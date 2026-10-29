// Risk / ratio analytics from NAV history (pure functions). Dates 'YYYY-MM-DD', all outputs in % unless stated.
// Definitions (UI ma pan dekhay che):
//  - Daily return = NAV(t) / previous available NAV - 1.  Annualisation: sqrt(periods per year), periods/yr = observations / years in window.
//  - CAGR = (last/base)^(1/years) - 1.  Std dev = stdev(returns) x sqrt(ppy).
//  - Sharpe = (CAGR - Rf) / Std dev.   Sortino = (CAGR - Rf) / downside deviation (target = Rf per period).
//  - Max drawdown = worst peak-to-trough fall in the window.  Calmar = 3Y CAGR / |3Y max drawdown|.
//  - Rolling return = return of every possible window (1Y absolute, 3Y CAGR) ending on each NAV date.
//  - SIP XIRR = XIRR of equal monthly instalments on the first NAV date of each month, valued at the latest NAV.
import { median as med, type NavRow } from './calc.ts';

const DAY = 86400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const TOL = 7 * DAY;

export function shiftYears(t: number, years: number): number {
  const d = new Date(t);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.getTime();
}

/** index of the last row with date <= target (ms) and within 7 days of it, else -1 */
export function baseIndex(times: number[], target: number): number {
  let lo = 0, hi = times.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (times[m] <= target) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans >= 0 && target - times[ans] <= TOL ? ans : -1;
}

const stdev = (a: number[]) => {
  if (a.length < 2) return null;
  const m = a.reduce((s, v) => s + v, 0) / a.length;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};

export type Drawdown = { pct: number; peak: string; trough: string; recovery: string | null };
export type WindowStats = { years: number; from: string; cagr: number; vol: number | null; sharpe: number | null; sortino: number | null; mdd: Drawdown | null };

export function maxDrawdown(rows: NavRow[]): { mdd: Drawdown | null; current: { pct: number; peak: string } | null } {
  if (rows.length < 2) return { mdd: null, current: null };
  let peak = rows[0], worst = 0, wPeak = rows[0], wTrough = rows[0];
  for (const r of rows) {
    if (r.nav > peak.nav) peak = r;
    const dd = r.nav / peak.nav - 1;
    if (dd < worst) { worst = dd; wPeak = peak; wTrough = r; }
  }
  let recovery: string | null = null;
  if (worst < 0) { const i = rows.findIndex((r) => r.date > wTrough.date && r.nav >= wPeak.nav); recovery = i >= 0 ? rows[i].date : null; }
  const last = rows[rows.length - 1];
  return { mdd: worst < 0 ? { pct: worst * 100, peak: wPeak.date, trough: wTrough.date, recovery } : { pct: 0, peak: rows[0].date, trough: rows[0].date, recovery: rows[0].date }, current: { pct: (last.nav / peak.nav - 1) * 100, peak: peak.date } };
}

/** Stats for the last `years` years. null if history does not cover the window. rf = annual % or null. */
export function windowStats(rows: NavRow[], years: number, rfPct: number | null): WindowStats | null {
  if (rows.length < 30) return null;
  const times = rows.map((r) => ms(r.date));
  const last = rows.length - 1;
  const b = baseIndex(times, shiftYears(times[last], years));
  if (b < 0) return null;
  const w = rows.slice(b);
  const span = (times[last] - times[b]) / (365.25 * DAY);
  if (span <= 0 || w.length < 20) return null;
  const rets: number[] = [];
  for (let i = 1; i < w.length; i++) rets.push(w[i].nav / w[i - 1].nav - 1);
  const ppy = rets.length / span;
  const cagr = (w[w.length - 1].nav / w[0].nav) ** (1 / span) - 1;
  const sd = stdev(rets);
  const vol = sd === null ? null : sd * Math.sqrt(ppy);
  let sharpe: number | null = null, sortino: number | null = null;
  if (rfPct !== null && vol && vol > 0) sharpe = (cagr * 100 - rfPct) / (vol * 100);
  if (rfPct !== null) {
    const rfp = (1 + rfPct / 100) ** (1 / ppy) - 1;
    const dd = Math.sqrt(rets.reduce((s, r) => s + Math.min(0, r - rfp) ** 2, 0) / rets.length) * Math.sqrt(ppy);
    sortino = dd > 0 ? (cagr - rfPct / 100) / dd : null;
  }
  return { years, from: w[0].date, cagr: cagr * 100, vol: vol === null ? null : vol * 100, sharpe, sortino, mdd: maxDrawdown(w).mdd };
}

export type RollingStats = { n: number; min: number; median: number; max: number; mean: number; posPct: number; ge10Pct: number; from: string };
export function rolling(rows: NavRow[], years: number, keepSeries = false): { stats: RollingStats | null; series: [number, number][] } {
  const times = rows.map((r) => ms(r.date));
  const out: number[] = [], series: [number, number][] = [];
  let j = 0, first = '';
  for (let i = 0; i < rows.length; i++) {
    const target = shiftYears(times[i], years);
    while (j + 1 <= i && times[j + 1] <= target) j++;
    if (times[j] <= target && target - times[j] <= TOL) {
      const g = rows[i].nav / rows[j].nav;
      const v = (years === 1 ? g - 1 : g ** (1 / years) - 1) * 100;
      out.push(v);
      if (!first) first = rows[i].date;
      if (keepSeries) series.push([times[i], v]);
    }
  }
  if (out.length < 20) return { stats: null, series: [] };
  const mean = out.reduce((s, v) => s + v, 0) / out.length;
  return { stats: { n: out.length, min: Math.min(...out), median: med(out)!, max: Math.max(...out), mean, posPct: (out.filter((v) => v > 0).length / out.length) * 100, ge10Pct: (out.filter((v) => v >= 10).length / out.length) * 100, from: first }, series };
}

export type CalYear = { year: number; ret: number; partial: boolean; from: string | null; ytd: boolean };
export function calendarYears(rows: NavRow[], max = 6): CalYear[] {
  if (rows.length < 2) return [];
  const lastOfYear = new Map<number, NavRow>();
  for (const r of rows) lastOfYear.set(+r.date.slice(0, 4), r);
  const years = [...lastOfYear.keys()].sort((a, b) => a - b);
  const latestYear = years[years.length - 1], firstYear = years[0];
  const out: CalYear[] = [];
  for (const y of years) {
    const end = lastOfYear.get(y)!;
    const prev = lastOfYear.get(y - 1);
    if (prev) out.push({ year: y, ret: (end.nav / prev.nav - 1) * 100, partial: false, from: null, ytd: y === latestYear });
    else if (y === firstYear && end.date !== rows[0].date) out.push({ year: y, ret: (end.nav / rows[0].nav - 1) * 100, partial: true, from: rows[0].date, ytd: y === latestYear });
  }
  return out.slice(-max);
}

export function monthStats(rows: NavRow[]) {
  const endOf = new Map<string, NavRow>();
  for (const r of rows) endOf.set(r.date.slice(0, 7), r);
  const keys = [...endOf.keys()].sort();
  const rets: { m: string; ret: number }[] = [];
  for (let i = 1; i < keys.length; i++) rets.push({ m: keys[i], ret: (endOf.get(keys[i])!.nav / endOf.get(keys[i - 1])!.nav - 1) * 100 });
  if (rets.length < 6) return null;
  const best = rets.reduce((a, b) => (b.ret > a.ret ? b : a)), worst = rets.reduce((a, b) => (b.ret < a.ret ? b : a));
  return { best, worst, posPct: (rets.filter((r) => r.ret > 0).length / rets.length) * 100, n: rets.length };
}

/** XIRR (annual %) of dated cash flows; null if no sign change / not converging */
export function xirr(flows: { t: number; amt: number }[]): number | null {
  if (!flows.some((f) => f.amt < 0) || !flows.some((f) => f.amt > 0)) return null;
  const t0 = flows[0].t;
  const f = (r: number) => flows.reduce((s, c) => s + c.amt / (1 + r) ** ((c.t - t0) / (365 * DAY)), 0);
  let lo = -0.95, hi = 10, flo = f(lo), fhi = f(hi);
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2, fm = f(mid);
    if (Math.abs(fm) < 1e-9) return mid * 100;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return ((lo + hi) / 2) * 100;
}

export type SipResult = { months: number; invested: number; value: number; xirr: number | null; from: string };
export function sip(rows: NavRow[], months: number, amount = 10000): SipResult | null {
  if (rows.length < 30) return null;
  const last = rows[rows.length - 1];
  const firstOfMonth = new Map<string, NavRow>();
  for (const r of rows) { const k = r.date.slice(0, 7); if (!firstOfMonth.has(k)) firstOfMonth.set(k, r); }
  const keys = [...firstOfMonth.keys()].sort();
  const sel = keys.slice(-months);
  if (sel.length < months) return null;
  const startMonth = sel[0];
  // history poori hovi joie: pehli installment ni mahina ni shuruat pehla NAV hovo joie
  if (rows[0].date > `${startMonth}-07`) return null;
  let units = 0;
  const flows: { t: number; amt: number }[] = [];
  for (const k of sel) { const r = firstOfMonth.get(k)!; units += amount / r.nav; flows.push({ t: ms(r.date), amt: -amount }); }
  const value = units * last.nav;
  flows.push({ t: ms(last.date), amt: value });
  return { months, invested: amount * sel.length, value, xirr: xirr(flows), from: firstOfMonth.get(startMonth)!.date };
}

export type Analytics = {
  asOf: string; historyFrom: string; historyYears: number; rfPct: number | null;
  windows: { '1y': WindowStats | null; '3y': WindowStats | null; '5y': WindowStats | null };
  all: { mdd: Drawdown | null; current: { pct: number; peak: string } | null };
  calmar3y: number | null;
  rolling: { '1y': RollingStats | null; '3y': RollingStats | null };
  rollingSeries1y: [number, number][];
  calendar: CalYear[]; months: ReturnType<typeof monthStats>;
  sip: { '1y': SipResult | null; '3y': SipResult | null; '5y': SipResult | null };
};

export function computeAnalytics(rows: NavRow[], o: { rfPct: number | null; series?: boolean; sipAmount?: number }): Analytics | null {
  if (rows.length < 30) return null;
  const last = rows[rows.length - 1];
  const w = { '1y': windowStats(rows, 1, o.rfPct), '3y': windowStats(rows, 3, o.rfPct), '5y': windowStats(rows, 5, o.rfPct) };
  const r1 = rolling(rows, 1, !!o.series), r3 = rolling(rows, 3);
  const dd3 = w['3y']?.mdd?.pct;
  const step = Math.max(1, Math.ceil(r1.series.length / 260));
  return {
    asOf: last.date, historyFrom: rows[0].date, historyYears: (ms(last.date) - ms(rows[0].date)) / (365.25 * DAY), rfPct: o.rfPct,
    windows: w, all: maxDrawdown(rows), calmar3y: w['3y'] && dd3 && dd3 < 0 ? w['3y'].cagr / Math.abs(dd3) : null,
    rolling: { '1y': r1.stats, '3y': r3.stats }, rollingSeries1y: r1.series.filter((_, i) => i % step === 0),
    calendar: calendarYears(rows), months: monthStats(rows),
    sip: { '1y': sip(rows, 12, o.sipAmount), '3y': sip(rows, 36, o.sipAmount), '5y': sip(rows, 60, o.sipAmount) },
  };
}

// ------------------------------------------------------------------ peer comparison
export function rankIn(values: number[], mine: number, higherIsBetter = true) {
  const better = values.filter((v) => (higherIsBetter ? v > mine : v < mine)).length;
  const total = values.length;
  const rank = better + 1;
  return { rank, total, quartile: Math.min(4, Math.ceil((rank / total) * 4)), avg: total ? values.reduce((s, v) => s + v, 0) / total : null, median: med(values) };
}
