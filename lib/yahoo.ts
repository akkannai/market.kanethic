import { cached } from './cache.ts';
import { recordError, recordOk } from './health.ts';

const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const SOURCE = 'Yahoo Finance';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

export type RawQuote = {
  price: number;
  prev: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  w52h: number | null;
  w52l: number | null;
  time: number; // epoch ms
  spark: number[];
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Yahoo chart JSON -> RawQuote. Kharab / adhuri data par throw kare (kadi guess nahi). */
export function parseChart(json: any): RawQuote {
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error(json?.chart?.error?.description || 'Empty chart response');
  const meta = r.meta ?? {};
  const q = r.indicators?.quote?.[0] ?? {};
  const ts: number[] = r.timestamp ?? [];
  const closes: (number | null)[] = q.close ?? [];

  const spark: number[] = [];
  let lastIdx = -1;
  closes.forEach((c, i) => {
    const v = num(c);
    if (v !== null) {
      spark.push(v);
      lastIdx = i;
    }
  });

  const price = num(meta.regularMarketPrice) ?? (spark.length ? spark[spark.length - 1] : null);
  if (price === null || price <= 0) throw new Error('No valid price');
  const timeSec = num(meta.regularMarketTime) ?? (lastIdx >= 0 ? num(ts[lastIdx]) : null);
  if (timeSec === null) throw new Error('No timestamp');

  const first = (arr?: (number | null)[]) => (arr ?? []).map(num).find((v) => v !== null) ?? null;
  const maxOf = (arr?: (number | null)[]) => {
    const v = (arr ?? []).map(num).filter((x): x is number => x !== null);
    return v.length ? Math.max(...v) : null;
  };
  const minOf = (arr?: (number | null)[]) => {
    const v = (arr ?? []).map(num).filter((x): x is number => x !== null);
    return v.length ? Math.min(...v) : null;
  };

  const prev = num(meta.chartPreviousClose) ?? num(meta.previousClose);
  return {
    price,
    prev: prev !== null && prev > 0 ? prev : null,
    open: first(q.open),
    high: num(meta.regularMarketDayHigh) ?? maxOf(q.high),
    low: num(meta.regularMarketDayLow) ?? minOf(q.low),
    w52h: num(meta.fiftyTwoWeekHigh),
    w52l: num(meta.fiftyTwoWeekLow),
    time: timeSec * 1000,
    spark,
  };
}

export type HistoryPoint = [number, number]; // [epoch ms, close]

export function parseHistory(json: any): HistoryPoint[] {
  const r = json?.chart?.result?.[0];
  if (!r) throw new Error(json?.chart?.error?.description || 'Empty chart response');
  const ts: number[] = r.timestamp ?? [];
  const closes: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
  const pts: HistoryPoint[] = [];
  ts.forEach((t, i) => {
    const c = num(closes[i]);
    if (c !== null && typeof t === 'number') pts.push([t * 1000, c]);
  });
  if (!pts.length) throw new Error('No history points');
  return pts;
}

let blockedUntil = 0; // Yahoo 429 aape to 5 min sudhi vadhu try na karvu (ban vadhe nahi)
export const yahooCooldown = () => Math.max(0, blockedUntil - Date.now());

async function fetchChart(symbol: string, range: string, interval: string): Promise<any> {
  if (Date.now() < blockedUntil) throw new Error('Yahoo rate-limited (cooling down)');
  const timeout = Number(process.env.UPSTREAM_TIMEOUT_MS) || 8000;
  let lastErr: unknown;
  for (const host of HOSTS) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: 'application/json' },
        signal: AbortSignal.timeout(timeout),
        cache: 'no-store',
      });
      if (res.status === 429) { blockedUntil = Date.now() + 5 * 60_000; throw new Error('HTTP 429'); }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function getSymbolQuote(symbol: string): Promise<RawQuote> {
  const { value } = await cached(`q:${symbol}`, 40_000, async () => {
    try {
      const q = parseChart(await fetchChart(symbol, '1d', '5m'));
      recordOk(SOURCE);
      return q;
    } catch (e) {
      recordError(SOURCE, new Error(`${symbol}: ${e instanceof Error ? e.message : e}`));
      throw e;
    }
  });
  return value;
}

export const RANGES = {
  '1d': { range: '1d', interval: '5m', ttl: 45_000 },
  '5d': { range: '5d', interval: '15m', ttl: 120_000 },
  '1m': { range: '1mo', interval: '1d', ttl: 300_000 },
  '6m': { range: '6mo', interval: '1d', ttl: 600_000 },
  '1y': { range: '1y', interval: '1d', ttl: 600_000 },
  '5y': { range: '5y', interval: '1wk', ttl: 1_800_000 },
} as const;
export type RangeKey = keyof typeof RANGES;

export async function getHistory(symbol: string, key: RangeKey): Promise<HistoryPoint[]> {
  const r = RANGES[key];
  const { value } = await cached(`h:${symbol}:${key}`, r.ttl, async () => {
    try {
      const pts = parseHistory(await fetchChart(symbol, r.range, r.interval));
      recordOk(SOURCE);
      return pts;
    } catch (e) {
      recordError(SOURCE, new Error(`${symbol} ${key}: ${e instanceof Error ? e.message : e}`));
      throw e;
    }
  });
  return value;
}
