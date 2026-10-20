import { byId } from '@/lib/instruments';
import { RANGES, type RangeKey } from '@/lib/yahoo';
import { getInstrumentHistory } from '@/lib/history';
import { cached } from '@/lib/cache';
import { getAllQuotes } from '@/lib/quotes';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const inst = byId.get(sp.get('id') ?? '');
  const range = (sp.get('range') ?? '1d') as RangeKey;
  if (!inst || !(range in RANGES)) return Response.json({ error: 'Bad request' }, { status: 400 });
  try {
    const { points: raw, source } = await getInstrumentHistory(inst, range);
    let points = inst.yield && raw.some(([, v]) => v > 20) ? raw.map(([t, v]) => [t, v / 10] as [number, number]) : raw;
    // Daily/weekly series aaj na bhav sudhi lambavo, jethi chart no chhelo bindu header ni kimat sathe malе
    if (range !== '1d' && range !== '5d') {
      try {
        const q = (await cached('all-quotes', 20_000, getAllQuotes)).value.quotes[inst.id];
        const last = points[points.length - 1];
        if (q && q.time > last[0] + 6 * 3600_000 && q.time <= Date.now() + 3600_000) points = [...points, [q.time, q.price]];
      } catch { /* quote na male to history jevi chhe tevi */ }
    }
    return Response.json({ id: inst.id, range, source, from: points[0][0], points }, { headers: { 'Cache-Control': 'public, max-age=30' } });
  } catch (e) {
    return Response.json({ error: 'History unavailable', detail: (e instanceof Error ? e.message : String(e)).slice(0, 400) }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
