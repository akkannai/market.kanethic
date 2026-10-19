import { getFunds, type Fund } from '@/lib/amfi';
import { getNavHistory, isSchemeCode } from '@/lib/mfapi';
import { downsample, trailingReturns } from '@/lib/mfmath';
import { mfPlan } from '@/lib/mfplan';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!isSchemeCode(code)) return Response.json({ error: 'Bad request' }, { status: 400 });
  const [amfi, hist] = await Promise.allSettled([getFunds(), getNavHistory(code)]);
  let fund: Fund | undefined = amfi.status === 'fulfilled' ? amfi.value.funds.find((f) => f.code === code) : undefined;
  const history = hist.status === 'fulfilled' ? hist.value : undefined;
  if (!fund && history) {
    const last = history.points[history.points.length - 1];
    fund = { code, name: history.meta.name, nav: last[1], date: new Date(last[0]).toISOString().slice(0, 10), category: history.meta.category, amc: history.meta.house };
  }
  if (fund && mfPlan() === 'regular' && /direct/i.test(fund.name)) return Response.json({ error: 'Scheme not found' }, { status: 404 });
  if (!fund) return Response.json({ error: 'Scheme not found' }, { status: amfi.status === 'rejected' && hist.status === 'rejected' ? 503 : 404 });
  return Response.json(
    { fund, returns: history ? trailingReturns(history.points) : null, points: history ? downsample(history.points) : null },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
