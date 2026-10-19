import { cached } from '@/lib/cache';

export const dynamic = 'force-dynamic';

// Server thi dara upstream ne test kare: kaya host chale che, kayo block che (HTTP code / error).
const TESTS: [string, string][] = [
  ['Yahoo query1 (indices/FX)', 'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1d&interval=5m'],
  ['Yahoo query2', 'https://query2.finance.yahoo.com/v8/finance/chart/USDINR%3DX?range=1d&interval=5m'],
  ['Stooq (fallback)', 'https://stooq.com/q/d/l/?s=%5Espx&i=d'],
  ['ECB / Frankfurter (FX fallback)', 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR'],
  ['AMFI NAVAll', 'https://www.amfiindia.com/spages/NAVAll.txt'],
  ['mfapi.in', 'https://api.mfapi.in/mf/search?q=flexi'],
  ['Economic Times RSS', 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms'],
  ['Economic calendar', 'https://nfs.faireconomy.media/ff_calendar_thisweek.json'],
];

async function probe([name, url]: [string, string]) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36' }, signal: AbortSignal.timeout(12_000), cache: 'no-store' });
    const reader = res.body?.getReader();
    const first = reader ? new TextDecoder().decode((await reader.read()).value ?? new Uint8Array()).slice(0, 90) : '';
    await reader?.cancel();
    return { name, ok: res.ok, status: res.status, ms: Date.now() - t0, sample: res.ok ? '' : first.replace(/\s+/g, ' ') };
  } catch (e) {
    const c = (e as { cause?: { code?: string; message?: string } })?.cause;
    return { name, ok: false, status: 0, ms: Date.now() - t0, sample: `${e instanceof Error ? e.message : e}${c?.code ? ` (${c.code})` : ''}` };
  }
}

export async function GET() {
  const { value, at } = await cached('diag', 60_000, async () => Promise.all(TESTS.map(probe)));
  return Response.json({ checkedAt: at, node: process.version, results: value }, { headers: { 'Cache-Control': 'no-store' } });
}
