import { byId } from '@/lib/instruments';
import { RANGES, type RangeKey } from '@/lib/yahoo';
import { getInstrumentHistory } from '@/lib/history';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const inst = byId.get(sp.get('id') ?? '');
  const range = (sp.get('range') ?? '1d') as RangeKey;
  if (!inst || !(range in RANGES)) return Response.json({ error: 'Bad request' }, { status: 400 });
  try {
    const { points: raw, source } = await getInstrumentHistory(inst, range);
    const points = inst.yield && raw.some(([, v]) => v > 20) ? raw.map(([t, v]) => [t, v / 10] as [number, number]) : raw;
    return Response.json({ id: inst.id, range, source, from: points[0][0], points }, { headers: { 'Cache-Control': 'public, max-age=30' } });
  } catch (e) {
    return Response.json({ error: 'History unavailable', detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
