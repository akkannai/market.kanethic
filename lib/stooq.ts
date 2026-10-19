import { cached } from './cache.ts';
import { recordError, recordOk } from './health.ts';
import type { RawQuote } from './yahoo.ts';

// Fallback (daily close): Stooq CSV. Yahoo na aape tyare global indices mate.
// Aa instrument-id -> Stooq symbol list ma fakt e j che jena par pakku identity match chhe (Nasdaq Composite, ASX 200 jaan-bujhine nathi).
export const STOOQ: Record<string, string> = {
  sp500: '^spx', dow: '^dji', ftse: '^ukx', dax: '^dax', cac: '^cac', nikkei: '^nkx',
  hangseng: '^hsi', shanghai: '^shc', kospi: '^kospi', sti: '^sti',
};

export function parseStooqCsv(text: string): RawQuote {
  const lines = text.trim().split(/\r?\n/);
  if (!/^date,/i.test(lines[0] ?? '')) throw new Error(lines[0]?.slice(0, 80) || 'Empty Stooq response');
  const rows = lines.slice(1).map((l) => l.split(',')).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f[0]) && Number.isFinite(Number(f[4])) && Number(f[4]) > 0);
  if (rows.length < 2) throw new Error('Not enough Stooq rows');
  const last = rows[rows.length - 1], prev = rows[rows.length - 2];
  const n = (v: string) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null);
  return {
    price: Number(last[4]), prev: Number(prev[4]), open: n(last[1]), high: n(last[2]), low: n(last[3]), w52h: null, w52l: null,
    time: Date.parse(`${last[0]}T20:00:00Z`), spark: rows.slice(-30).map((f) => Number(f[4])),
  };
}

export async function getStooqQuote(symbol: string): Promise<RawQuote> {
  const { value } = await cached(`stooq:${symbol}`, 600_000, async () => {
    const d = (ms: number) => new Date(Date.now() - ms).toISOString().slice(0, 10).replaceAll('-', '');
    try {
      const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d&d1=${d(40 * 86400_000)}&d2=${d(-86400_000)}`;
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 KanethicMarketHub/1.0' }, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const q = parseStooqCsv(await res.text());
      recordOk('Stooq (fallback)');
      return q;
    } catch (e) {
      recordError('Stooq (fallback)', new Error(`${symbol}: ${e instanceof Error ? e.message : e}`));
      throw e;
    }
  });
  return value;
}
