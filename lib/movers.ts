import { cached, pool } from './cache.ts';
import { nifty50 } from './nifty50.ts';
import { getSymbolQuote } from './yahoo.ts';

export type Mover = { symbol: string; name: string; price: number; change: number; pct: number; time: number };

export function rank(rows: Mover[], n = 6) {
  const sorted = [...rows].sort((a, b) => b.pct - a.pct);
  return { gainers: sorted.filter((r) => r.pct > 0).slice(0, n), losers: sorted.filter((r) => r.pct < 0).slice(-n).reverse() };
}

export async function getMovers() {
  const { value, at, stale } = await cached('movers', 120_000, async () => {
    const res = await pool(nifty50, 6, (s) => getSymbolQuote(s[0]));
    const rows: Mover[] = [];
    nifty50.forEach(([symbol, name], i) => {
      const q = res[i];
      if (!q || q.prev === null) return;
      rows.push({ symbol: symbol.replace(/\.NS$/, ''), name, price: q.price, change: q.price - q.prev, pct: ((q.price - q.prev) / q.prev) * 100, time: q.time });
    });
    if (rows.length < 10) throw new Error(`Only ${rows.length} constituents available`);
    return { ...rank(rows), count: rows.length, asOf: Math.max(...rows.map((r) => r.time)) };
  });
  return { ...value, at, stale };
}
