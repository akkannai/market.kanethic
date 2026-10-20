import { cached } from './cache.ts';
import { recordError, recordOk } from './health.ts';
import { catalog } from './instruments.ts';
import type { RawQuote } from './yahoo.ts';

// Yahoo v8 chart 429 aape tyare (server IP block) -- bija batch sources. Badha ek request ma ghana instrument lave che.
const TIMEOUT = () => Number(process.env.UPSTREAM_TIMEOUT_MS) || 8000;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[,%+\s]/g, '')) : NaN;
  return Number.isFinite(n) ? n : null;
};
const pos = (v: unknown) => { const n = num(v); return n !== null && n > 0 ? n : null; };

export type Batch = Map<string, RawQuote>; // instrument id -> quote

// ---------------------------------------------------------------- NSE India (official, Indian indices + Nifty 50 stocks)
export const NSE_NAMES: Record<string, string> = {
  nifty50: 'NIFTY 50', banknifty: 'NIFTY BANK', midcap100: 'NIFTY MIDCAP 100', smallcap100: 'NIFTY SMALLCAP 100', vix: 'INDIA VIX',
  it: 'NIFTY IT', auto: 'NIFTY AUTO', pharma: 'NIFTY PHARMA', financial: 'NIFTY FINANCIAL SERVICES', fmcg: 'NIFTY FMCG',
  metal: 'NIFTY METAL', realty: 'NIFTY REALTY', energy: 'NIFTY ENERGY', psubank: 'NIFTY PSU BANK',
};

/** "20-Oct-2026 15:30:00" (IST) -> epoch ms */
export function nseTime(s: string): number | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const mon = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase());
  if (mon < 0) return null;
  return Date.UTC(+m[3], mon, +m[1], +m[4], +m[5], +m[6]) - 5.5 * 3600_000;
}

export function parseNseAllIndices(json: any): Batch {
  const rows = json?.data;
  const stamp = typeof json?.timestamp === 'string' ? nseTime(json.timestamp) : null;
  if (!Array.isArray(rows) || stamp === null) throw new Error('Unexpected NSE format');
  const byName = new Map<string, any>(rows.map((r: any) => [String(r.index ?? r.indexSymbol).toUpperCase(), r]));
  const out: Batch = new Map();
  for (const [id, name] of Object.entries(NSE_NAMES)) {
    const r = byName.get(name);
    const price = pos(r?.last);
    if (!r || price === null) continue;
    out.set(id, { price, prev: pos(r.previousClose), open: pos(r.open), high: pos(r.high), low: pos(r.low), w52h: pos(r.yearHigh), w52l: pos(r.yearLow), time: stamp, spark: [] });
  }
  if (!out.size) throw new Error('No NSE indices matched');
  return out;
}

async function nseSession(): Promise<string> {
  const { value } = await cached('nse-cookie', 10 * 60_000, async () => {
    const res = await fetch('https://www.nseindia.com/', { headers: { 'user-agent': BROWSER_UA, accept: 'text/html,*/*', 'accept-language': 'en-IN,en;q=0.9' }, signal: AbortSignal.timeout(TIMEOUT()), cache: 'no-store', redirect: 'follow' });
    if (!res.ok) throw new Error(`NSE home HTTP ${res.status}`);
    const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    if (!cookie) throw new Error('NSE gave no cookie');
    return cookie;
  });
  return value;
}

async function nseGet(path: string): Promise<any> {
  const cookie = await nseSession();
  const res = await fetch(`https://www.nseindia.com${path}`, {
    headers: { 'user-agent': BROWSER_UA, accept: '*/*', 'accept-language': 'en-IN,en;q=0.9', referer: 'https://www.nseindia.com/market-data/live-market-indices', cookie },
    signal: AbortSignal.timeout(TIMEOUT()), cache: 'no-store',
  });
  if (!res.ok) throw new Error(`NSE HTTP ${res.status}`);
  return res.json();
}

export async function fetchNse(): Promise<Batch> {
  try {
    const b = parseNseAllIndices(await nseGet('/api/allIndices'));
    recordOk('NSE India');
    return b;
  } catch (e) {
    recordError('NSE India', e);
    throw e;
  }
}

export type StockRow = { symbol: string; price: number; prev: number; time: number };
export function parseNseStocks(json: any): StockRow[] {
  const stamp = typeof json?.timestamp === 'string' ? nseTime(json.timestamp) : Date.now();
  if (!Array.isArray(json?.data) || stamp === null) throw new Error('Unexpected NSE stocks format');
  return json.data
    .filter((r: any) => r?.symbol && r.symbol !== 'NIFTY 50' && r.priority !== 1)
    .map((r: any) => ({ symbol: String(r.symbol), price: pos(r.lastPrice), prev: pos(r.previousClose), time: stamp }))
    .filter((r: any) => r.price !== null && r.prev !== null) as StockRow[];
}
export async function fetchNseNifty50(): Promise<StockRow[]> {
  try {
    const rows = parseNseStocks(await nseGet('/api/equity-stockIndices?index=NIFTY%2050'));
    recordOk('NSE India');
    return rows;
  } catch (e) {
    recordError('NSE India', e);
    throw e;
  }
}

// ---------------------------------------------------------------- CNBC quote service (global indices, commodities, yield)
export const CNBC: Record<string, string> = {
  sp500: '.SPX', dow: '.DJI', nasdaq: '.IXIC', ftse: '.FTSE', dax: '.GDAXI', cac: '.FCHI', nikkei: '.N225', hangseng: '.HSI',
  shanghai: '.SSEC', kospi: '.KS11', sti: '.STI', asx: '.AXJO', dxy: '.DXY', sensex: '.BSESN',
  gold: '@GC.1', silver: '@SI.1', wti: '@CL.1', natgas: '@NG.1', copper: '@HG.1', brent: '@LCO.1', us10y: 'US10Y',
};

export function parseCnbc(json: any, now = Date.now()): Batch {
  const raw = json?.FormattedQuoteResult?.FormattedQuote;
  const list: any[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const bySym = new Map(list.map((r) => [String(r.symbol), r]));
  const out: Batch = new Map();
  for (const [id, sym] of Object.entries(CNBC)) {
    const r = bySym.get(sym);
    const price = pos(r?.last);
    if (!r || price === null) continue;
    const t = num(r.last_time_msec) ?? Date.parse(String(r.last_time));
    if (!Number.isFinite(t) || (t as number) > now + 3600_000) continue; // timestamp vagar ni quote nakari
    out.set(id, { price, prev: pos(r.previous_day_closing), open: pos(r.open), high: pos(r.high), low: pos(r.low), w52h: null, w52l: null, time: t as number, spark: [] });
  }
  if (!out.size) throw new Error('No CNBC symbols matched');
  return out;
}

export async function fetchCnbc(): Promise<Batch> {
  try {
    const syms = Object.values(CNBC).join('|');
    const url = `https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${encodeURIComponent(syms)}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1`;
    const res = await fetch(url, { headers: { 'user-agent': BROWSER_UA, accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT()), cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const b = parseCnbc(await res.json());
    recordOk('CNBC quotes');
    return b;
  } catch (e) {
    recordError('CNBC quotes', e);
    throw e;
  }
}

// ---------------------------------------------------------------- Yahoo v7 batch quote (cookie + crumb)
export function parseYahooQuotes(json: any): Batch {
  const list = json?.quoteResponse?.result;
  if (!Array.isArray(list)) throw new Error(json?.quoteResponse?.error?.description || json?.finance?.error?.description || 'Unexpected Yahoo quote format');
  const bySym = new Map(list.map((r: any) => [String(r.symbol), r]));
  const out: Batch = new Map();
  for (const inst of catalog) {
    const r = inst.symbol ? bySym.get(inst.symbol) : undefined;
    const price = pos(r?.regularMarketPrice);
    const t = num(r?.regularMarketTime);
    if (!r || price === null || t === null) continue;
    out.set(inst.id, { price, prev: pos(r.regularMarketPreviousClose), open: pos(r.regularMarketOpen), high: pos(r.regularMarketDayHigh), low: pos(r.regularMarketDayLow), w52h: pos(r.fiftyTwoWeekHigh), w52l: pos(r.fiftyTwoWeekLow), time: t * 1000, spark: [] });
  }
  if (!out.size) throw new Error('No Yahoo symbols matched');
  return out;
}

async function yahooCrumb(): Promise<{ cookie: string; crumb: string }> {
  const { value } = await cached('yahoo-crumb', 25 * 60_000, async () => {
    const h = { 'user-agent': BROWSER_UA, 'accept-language': 'en-US,en;q=0.9' };
    const c = await fetch('https://fc.yahoo.com/', { headers: h, signal: AbortSignal.timeout(TIMEOUT()), cache: 'no-store', redirect: 'manual' });
    const cookie = c.headers.getSetCookie().map((x) => x.split(';')[0]).join('; ');
    if (!cookie) throw new Error(`Yahoo cookie missing (HTTP ${c.status})`);
    const r = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { ...h, cookie }, signal: AbortSignal.timeout(TIMEOUT()), cache: 'no-store' });
    if (!r.ok) throw new Error(`Yahoo crumb HTTP ${r.status}`);
    const crumb = (await r.text()).trim();
    if (!crumb || crumb.length > 40 || /[<\s]/.test(crumb)) throw new Error('Yahoo crumb invalid');
    return { cookie, crumb };
  });
  return value;
}

export async function fetchYahooBatch(): Promise<Batch> {
  try {
    const { cookie, crumb } = await yahooCrumb();
    const symbols = catalog.map((i) => i.symbol).filter(Boolean).join(',');
    const res = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&crumb=${encodeURIComponent(crumb)}`, {
      headers: { 'user-agent': BROWSER_UA, accept: 'application/json', cookie }, signal: AbortSignal.timeout(TIMEOUT()), cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const b = parseYahooQuotes(await res.json());
    recordOk('Yahoo batch quote');
    return b;
  } catch (e) {
    recordError('Yahoo batch quote', e);
    throw e;
  }
}
