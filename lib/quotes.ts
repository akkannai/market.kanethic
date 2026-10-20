import { catalog, type Instrument } from './instruments.ts';
import { pool } from './cache.ts';
import { getSymbolQuote, type RawQuote } from './yahoo.ts';
import { goldInrPer10g, silverInrPerKg } from './bullion.ts';
import { getUsdSeries, pairFromSeries } from './ecb.ts';
import { STOOQ, getStooqQuote } from './stooq.ts';
import { NSE_NAMES, fetchCnbc, fetchNse, fetchYahooBatch, type Batch } from './providers.ts';

export type Quote = {
  id: string;
  price: number;
  prev: number | null;
  /** Absolute change. Yield ma basis points. */
  change: number | null;
  pct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  w52h: number | null;
  w52l: number | null;
  time: number;
  /** live = taaji print (<= 30 min junu); closed = last close / bazaar bandh */
  state: 'live' | 'closed';
  spark: number[];
  source: string;
};

const LIVE_WINDOW_MS = 30 * 60_000;

/** Yield quote kyarek x10 scale ma aave che. 20% thi vadhu US 10Y asambhav che. */
function scaleYield(raw: RawQuote): RawQuote {
  if (raw.price <= 20) return raw;
  const s = (v: number | null) => (v === null ? null : v / 10);
  return { ...raw, price: raw.price / 10, prev: s(raw.prev), open: s(raw.open), high: s(raw.high), low: s(raw.low), w52h: s(raw.w52h), w52l: s(raw.w52l), spark: raw.spark.map((v) => v / 10) };
}

export function toQuote(inst: Instrument, raw: RawQuote, source: string, now = Date.now()): Quote {
  const r = inst.yield ? scaleYield(raw) : raw;
  const diff = r.prev !== null ? r.price - r.prev : null;
  return {
    id: inst.id,
    price: r.price,
    prev: r.prev,
    change: diff === null ? null : inst.yield ? diff * 100 : diff,
    pct: diff === null || inst.yield ? null : (diff / (r.prev as number)) * 100,
    open: r.open, high: r.high, low: r.low, w52h: r.w52h, w52l: r.w52l,
    time: r.time,
    state: now - r.time <= LIVE_WINDOW_MS ? 'live' : 'closed',
    spark: r.spark,
    source,
  };
}

export async function getAllQuotes(): Promise<{ quotes: Record<string, Quote>; failed: string[] }> {
  const direct = catalog.filter((i) => i.symbol);
  const none = async (): Promise<Batch> => new Map();
  const [results, nse, yb, cnbc] = await Promise.all([
    pool(direct, 8, (i) => getSymbolQuote(i.symbol as string)),
    fetchNse().catch(none),
    fetchYahooBatch().catch(none),
    fetchCnbc().catch(none),
  ]);
  const quotes: Record<string, Quote> = {};
  const raws = new Map<string, RawQuote>();
  const failed: string[] = [];
  direct.forEach((inst, k) => {
    // Priority: NSE (official, Indian indices) > Yahoo chart (sparkline sathe) > Yahoo batch > CNBC
    const picks: [RawQuote | undefined, string][] = [
      [NSE_NAMES[inst.id] ? nse.get(inst.id) : undefined, 'NSE India'],
      [results[k], 'Yahoo Finance'],
      [yb.get(inst.id), 'Yahoo Finance (batch)'],
      [cnbc.get(inst.id), 'CNBC'],
    ];
    const hit = picks.find(([r]) => r);
    if (hit) {
      const raw = hit[0] as RawQuote;
      // NSE/CNBC/batch ma sparkline nathi: Yahoo chart ni hoy to e rakhvi
      if (!raw.spark.length && results[k]?.spark.length) raw.spark = results[k]!.spark;
      raws.set(inst.id, raw);
      quotes[inst.id] = toQuote(inst, raw, hit[1]);
    } else failed.push(inst.id);
  });

  // Global indices fallback: Yahoo na aape to Stooq (daily close)
  const missingIdx = catalog.filter((i) => STOOQ[i.id] && !quotes[i.id]);
  if (missingIdx.length) {
    const rs = await pool(missingIdx, 4, (i) => getStooqQuote(STOOQ[i.id]));
    missingIdx.forEach((inst, k) => {
      const raw = rs[k];
      if (!raw) return;
      raws.set(inst.id, raw);
      quotes[inst.id] = toQuote(inst, raw, 'Stooq daily close (fallback)');
      const f = failed.indexOf(inst.id);
      if (f >= 0) failed.splice(f, 1);
    });
  }

  // Currency fallback: Yahoo na aape to ECB (Frankfurter) reference rates
  const missingFx = catalog.filter((i) => i.group === 'fx' && !quotes[i.id]);
  if (missingFx.length) {
    try {
      const series = await getUsdSeries();
      for (const inst of missingFx) {
        const [base, quote] = inst.name.split('/');
        const raw = pairFromSeries(series, base, quote);
        if (!raw) continue;
        raws.set(inst.id, raw);
        quotes[inst.id] = toQuote(inst, raw, 'ECB reference rate (daily)');
        const k = failed.indexOf(inst.id);
        if (k >= 0) failed.splice(k, 1);
      }
    } catch {
      /* ECB pan na male to failed ma rahe */
    }
  }

  // Indian bullion: international price x USD/INR (x duty premium). Behe input hoy to j.
  const premium = Number(process.env.INDIA_BULLION_PREMIUM_PCT ?? 6);
  const fxr = raws.get('usdinr');
  for (const inst of catalog.filter((i) => i.derived)) {
    const base = raws.get(inst.derived === 'gold-in' ? 'gold' : 'silver');
    if (!base || !fxr || !Number.isFinite(premium)) {
      failed.push(inst.id);
      continue;
    }
    const conv = inst.derived === 'gold-in' ? goldInrPer10g : silverInrPerKg;
    const price = conv(base.price, fxr.price, premium);
    const prev = base.prev !== null && fxr.prev !== null ? conv(base.prev, fxr.prev, premium) : null;
    const k = price / base.price;
    quotes[inst.id] = toQuote(
      inst,
      {
        price, prev,
        open: base.open === null ? null : base.open * k,
        high: base.high === null ? null : base.high * k,
        low: base.low === null ? null : base.low * k,
        w52h: null, w52l: null,
        time: Math.min(base.time, fxr.time),
        spark: base.spark.map((v) => v * k),
      },
      `Derived: ${inst.derived === 'gold-in' ? 'COMEX gold' : 'COMEX silver'} × USD/INR + ${premium}% duty`,
    );
  }
  return { quotes, failed };
}
