import { byId } from '@/lib/instruments';
import { RANGES, getHistory, type HistoryPoint, type RangeKey } from '@/lib/yahoo';
import { goldInrPer10g, silverInrPerKg } from '@/lib/bullion';

export const dynamic = 'force-dynamic';

/** Gold/silver ni INR history: dar point par tej samay nu (ke pehla nu) USD/INR vapray che. */
async function derived(kind: 'gold-in' | 'silver-in', range: RangeKey): Promise<HistoryPoint[]> {
  const [base, fx] = await Promise.all([getHistory(kind === 'gold-in' ? 'GC=F' : 'SI=F', range), getHistory('USDINR=X', range)]);
  const premium = Number(process.env.INDIA_BULLION_PREMIUM_PCT ?? 6);
  const conv = kind === 'gold-in' ? goldInrPer10g : silverInrPerKg;
  let j = 0;
  const out: HistoryPoint[] = [];
  for (const [t, v] of base) {
    while (j + 1 < fx.length && fx[j + 1][0] <= t) j++;
    if (fx[j][0] <= t + 6 * 3600_000) out.push([t, conv(v, fx[j][1], premium)]);
  }
  if (!out.length) throw new Error('No overlapping data');
  return out;
}

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const inst = byId.get(sp.get('id') ?? '');
  const range = (sp.get('range') ?? '1d') as RangeKey;
  if (!inst || !(range in RANGES)) return Response.json({ error: 'Bad request' }, { status: 400 });
  try {
    let points = inst.derived ? await derived(inst.derived, range) : await getHistory(inst.symbol as string, range);
    if (inst.yield && points.some(([, v]) => v > 20)) points = points.map(([t, v]) => [t, v / 10]);
    return Response.json({ id: inst.id, range, points }, { headers: { 'Cache-Control': 'public, max-age=30' } });
  } catch {
    return Response.json({ error: 'History unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
