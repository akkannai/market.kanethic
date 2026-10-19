import { cached } from './cache.ts';
import { recordError, recordOk } from './health.ts';
import type { RawQuote } from './yahoo.ts';

// Fallback: ECB reference rates via Frankfurter (free, no key). Daily rates, bazar band thaya pachhi nu "last close" jevu.
// AED ECB ma nathi; USD ni sathe official peg (3.6725) thi ganay che.
const AED_PEG = 3.6725;
const SYMBOLS = ['INR', 'EUR', 'GBP', 'CAD', 'AUD', 'SGD', 'JPY'];
const HOSTS = ['https://api.frankfurter.dev', 'https://api.frankfurter.app'];

export type UsdSeries = { dates: string[]; rates: Record<string, number>[] }; // rates[i]: units of CCY per 1 USD

export function parseFrankfurter(json: any): UsdSeries {
  const byDate = json?.rates;
  if (!byDate || typeof byDate !== 'object') throw new Error('Unexpected Frankfurter format');
  const dates = Object.keys(byDate).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const rates: Record<string, number>[] = [];
  const keep: string[] = [];
  for (const d of dates) {
    const r: Record<string, number> = { USD: 1, AED: AED_PEG };
    let ok = true;
    for (const c of SYMBOLS) {
      const v = byDate[d]?.[c];
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) { ok = false; break; }
      r[c] = v;
    }
    if (ok) { keep.push(d); rates.push(r); }
  }
  if (keep.length < 2) throw new Error('Not enough Frankfurter data');
  return { dates: keep, rates };
}

/** pair 'EUR/INR' -> RawQuote (1 EUR = x INR) */
export function pairFromSeries(s: UsdSeries, base: string, quote: string): RawQuote | null {
  const val = (i: number) => {
    const b = s.rates[i][base], q = s.rates[i][quote];
    return b && q ? q / b : null;
  };
  const last = s.dates.length - 1;
  const price = val(last), prev = val(last - 1);
  if (price === null) return null;
  const spark = s.dates.map((_, i) => val(i)).filter((v): v is number => v !== null);
  return { price, prev, open: null, high: null, low: null, w52h: null, w52l: null, time: Date.parse(`${s.dates[last]}T14:00:00Z`), spark };
}

export async function getUsdSeries(): Promise<UsdSeries> {
  const { value } = await cached('ecb', 3600_000, async () => {
    const start = new Date(Date.now() - 12 * 86400_000).toISOString().slice(0, 10);
    let last: unknown;
    for (const host of HOSTS) {
      try {
        const res = await fetch(`${host}/v1/${start}..?base=USD&symbols=${SYMBOLS.join(',')}`, { headers: { 'user-agent': 'KanethicMarketHub/1.0' }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const s = parseFrankfurter(await res.json());
        recordOk('ECB rates (Frankfurter)');
        return s;
      } catch (e) {
        last = e;
      }
    }
    recordError('ECB rates (Frankfurter)', last);
    throw last;
  });
  return value;
}
