import { cached, pool } from './cache.ts';
import { recordError, recordOk } from './health.ts';
import { byId, type Instrument } from './instruments.ts';
import { CNBC, NSE_NAMES, nseGet } from './providers.ts';
import { downsample } from './mfmath.ts';
import { RANGES, getHistory, yahooCooldown, type HistoryPoint, type RangeKey } from './yahoo.ts';
import { goldInrPer10g, silverInrPerKg } from './bullion.ts';
import { getTicks } from './ticks.ts';

const DAY = 86400_000;
const TIMEOUT = () => Number(process.env.UPSTREAM_TIMEOUT_MS) || 8000;
const SPAN_DAYS: Record<RangeKey, number> = { '1d': 1, '5d': 5, '1m': 35, '6m': 190, '1y': 370, '5y': 5 * 366, '10y': 10 * 366, max: 40 * 366 };
const MAX_POINTS = 1500;

export type History = { points: HistoryPoint[]; source: string };
const intraday = (r: RangeKey) => r === '1d' || r === '5d';
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// ------------------------------------------------------------------ CNBC bars (global indices, commodities, yield)
export function parseCnbcBars(json: any): HistoryPoint[] {
  const bars = json?.barData?.priceBars ?? json?.barData?.priceBar;
  if (!Array.isArray(bars)) throw new Error('Unexpected CNBC bars format');
  const pts: HistoryPoint[] = [];
  for (const b of bars) {
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/.exec(String(b?.tradeTime));
    const c = Number(String(b?.close).replace(/,/g, ''));
    if (!m || !Number.isFinite(c) || c <= 0) continue;
    pts.push([Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)), c]);
  }
  if (pts.length < 2) throw new Error('Not enough CNBC bars');
  return pts.sort((a, b) => a[0] - b[0]);
}

async function cnbcHistory(sym: string, range: RangeKey): Promise<HistoryPoint[]> {
  const stamp = (ms: number) => ymd(ms).replaceAll('-', '') + '000000';
  const interval = range === '10y' || range === 'max' ? '1W' : '1D';
  const start = range === 'max' ? '19800101000000' : stamp(Date.now() - SPAN_DAYS[range] * DAY);
  const url = `https://ts-api.cnbc.com/harmony/app/bars/${encodeURIComponent(sym)}/${interval}/${start}/${stamp(Date.now() + DAY)}/adjusted/EXTENDED.json`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 KanethicMarketHub/1.0', accept: 'application/json' }, signal: AbortSignal.timeout(Math.max(TIMEOUT(), 15_000)), cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseCnbcBars(await res.json());
}

// ------------------------------------------------------------------ NSE India (Indian indices, 1 year per request)
export function nseDay(s: string): number | null {
  const m = /^(\d{1,2})-([A-Za-z]{3}|\d{2})-(\d{4})$/.exec(String(s).trim());
  if (!m) { const t = Date.parse(String(s)); return Number.isFinite(t) ? t : null; }
  const mon = /^\d+$/.test(m[2]) ? +m[2] - 1 : ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase());
  return mon < 0 ? null : Date.UTC(+m[3], mon, +m[1]);
}

export function parseNseHistory(json: any): HistoryPoint[] {
  const rows = json?.data?.indexCloseOnlineRecords ?? json?.indexCloseOnlineRecords;
  if (!Array.isArray(rows)) throw new Error('Unexpected NSE history format');
  const pts: HistoryPoint[] = [];
  for (const r of rows) {
    const t = nseDay(r?.EOD_TIMESTAMP ?? r?.TIMESTAMP);
    const c = Number(String(r?.EOD_CLOSE_INDEX_VAL ?? r?.CLOSE).replace(/,/g, ''));
    if (t !== null && Number.isFinite(c) && c > 0) pts.push([t, c]);
  }
  return pts.sort((a, b) => a[0] - b[0]);
}

async function nseHistory(name: string, range: RangeKey): Promise<HistoryPoint[]> {
  const dmy = (ms: number) => { const d = new Date(ms); return `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`; };
  const windows: [number, number][] = [];
  const floor = range === 'max' ? Date.UTC(1995, 0, 1) : Date.now() - SPAN_DAYS[range] * DAY;
  for (let end = Date.now(); end > floor; end -= 360 * DAY) windows.push([Math.max(floor, end - 359 * DAY), end]);
  const all: HistoryPoint[] = [];
  for (let i = 0; i < windows.length; i += 3) {
    const batch = windows.slice(i, i + 3);
    const res = await Promise.all(batch.map(([f, t]) => nseGet(`/api/historical/indicesHistory?indexType=${encodeURIComponent(name)}&from=${dmy(f)}&to=${dmy(t)}`).then(parseNseHistory)));
    res.forEach((r) => all.push(...r));
    if (range === 'max' && res.every((r) => r.length === 0)) break; // index tyare shuru j nahoto thayo
  }
  const dedup = [...new Map(all.map((p) => [p[0], p])).values()].sort((a, b) => a[0] - b[0]);
  if (dedup.length < 2) throw new Error('NSE returned no history');
  return dedup;
}

// ------------------------------------------------------------------ ECB via Frankfurter (daily since 1999)
const PEG: Record<string, number> = { AED: 3.6725 };
export function parseFxHistory(json: any, base: string, quote: string): HistoryPoint[] {
  const by = json?.rates;
  if (!by || typeof by !== 'object') throw new Error('Unexpected Frankfurter format');
  const rate = (r: any, c: string) => (c === 'USD' ? 1 : PEG[c] ?? (typeof r?.[c] === 'number' && r[c] > 0 ? r[c] : null));
  const pts: HistoryPoint[] = [];
  for (const d of Object.keys(by).sort()) {
    const b = rate(by[d], base), q = rate(by[d], quote);
    if (b && q && /^\d{4}-\d{2}-\d{2}$/.test(d)) pts.push([Date.parse(`${d}T14:00:00Z`), q / b]);
  }
  if (pts.length < 2) throw new Error('Not enough Frankfurter history');
  return pts;
}

async function fxHistory(base: string, quote: string, range: RangeKey): Promise<HistoryPoint[]> {
  const start = range === 'max' ? '1999-01-04' : ymd(Date.now() - SPAN_DAYS[range] * DAY);
  const symbols = [base, quote].filter((c) => c !== 'USD' && !PEG[c]).join(',') || 'EUR';
  let last: unknown;
  for (const host of ['https://api.frankfurter.dev', 'https://api.frankfurter.app']) {
    try {
      const res = await fetch(`${host}/v1/${start}..?base=USD&symbols=${symbols}`, { headers: { 'user-agent': 'KanethicMarketHub/1.0' }, signal: AbortSignal.timeout(20_000), cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseFxHistory(await res.json(), base, quote);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

// ------------------------------------------------------------------ chain
async function chain(inst: Instrument, range: RangeKey): Promise<History> {
  const tries: [string, () => Promise<HistoryPoint[]>][] = [];
  if (inst.symbol && !yahooCooldown()) tries.push(['Yahoo Finance', () => getHistory(inst.symbol as string, range)]);
  if (range === '1d') {
    tries.push(['Collected by this site', async () => {
      const t = getTicks(inst.id);
      if (t.length < 5) throw new Error(`Only ${t.length} intraday points collected so far (site collects 1 per minute while running)`);
      return t;
    }]);
  }
  if (!intraday(range)) {
    if (NSE_NAMES[inst.id]) tries.push(['NSE India', () => nseHistory(NSE_NAMES[inst.id], range)]);
    if (CNBC[inst.id]) tries.push(['CNBC', () => cnbcHistory(CNBC[inst.id], range)]);
    if (inst.group === 'fx') { const [b, q] = inst.name.split('/'); tries.push(['ECB (Frankfurter)', () => fxHistory(b, q, range)]); }
    if (inst.symbol && yahooCooldown()) tries.push(['Yahoo Finance', () => getHistory(inst.symbol as string, range)]); // last resort
  }
  const errors: string[] = [];
  for (const [source, fn] of tries) {
    try {
      const points = await fn();
      if (points.length >= 2) { recordOk(`History: ${source}`); return { points: downsample(points, MAX_POINTS), source }; }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${source}: ${msg}`);
      if (source !== 'Yahoo Finance') recordError(`History: ${source}`, e);
    }
  }
  throw new Error(errors.join('; ') || (intraday(range) ? 'Intraday chart needs Yahoo (unavailable)' : 'No history source'));
}

export async function getInstrumentHistory(inst: Instrument, range: RangeKey): Promise<History> {
  const ttl = RANGES[range].ttl;
  const { value } = await cached(`ih:${inst.id}:${range}`, ttl, async () => {
    if (inst.derived) {
      const spotInst = byId.get(inst.derived === 'gold-in' ? 'goldspot' : 'silverspot') as Instrument;
      const futInst = byId.get(inst.derived === 'gold-in' ? 'gold' : 'silver') as Instrument;
      const [b, fx] = await Promise.all([chain(spotInst, range).catch(() => chain(futInst, range)), chain(byId.get('usdinr') as Instrument, range)]);
      const premium = Number(process.env.INDIA_BULLION_PREMIUM_PCT ?? 6);
      const conv = inst.derived === 'gold-in' ? goldInrPer10g : silverInrPerKg;
      let j = 0;
      const out: HistoryPoint[] = [];
      for (const [t, v] of b.points) {
        while (j + 1 < fx.points.length && fx.points[j + 1][0] <= t) j++;
        if (fx.points[j][0] <= t + 6 * 3600_000 + (range === 'max' || range === '10y' ? 7 * DAY : 0)) out.push([t, conv(v, fx.points[j][1], premium)]);
      }
      if (out.length < 2) throw new Error('No overlapping data');
      return { points: out, source: `${b.source} × ${fx.source}` } as History;
    }
    return chain(inst, range);
  });
  return value;
}
