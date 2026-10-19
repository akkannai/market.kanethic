import { getFunds, searchFunds } from '@/lib/amfi';
import { searchViaMfapi } from '@/lib/mfapi';
import { mfPlan } from '@/lib/mfplan';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const q = (sp.get('q') ?? '').trim().slice(0, 80);
  const option = sp.get('option');
  const plan = mfPlan();
  const opt = option === 'growth' || option === 'idcw' ? option : undefined;
  const headers = { 'Cache-Control': 'public, max-age=60' };
  let amfiError = '';
  try {
    const { funds, latest, at } = await getFunds();
    return Response.json({ results: searchFunds(funds, latest, q, { plan, option: opt, limit: 30 }), latest, total: funds.length, at, source: 'AMFI' }, { headers });
  } catch (e) {
    amfiError = e instanceof Error ? e.message : String(e);
  }
  // Fallback: mfapi.in (AMFI data par aadharit)
  try {
    const { results, latest } = await searchViaMfapi(q, plan === 'regular');
    const filtered = results.filter((f) => !opt || (opt === 'growth' ? /growth/i.test(f.name) && !/idcw|dividend/i.test(f.name) : /idcw|dividend/i.test(f.name)));
    return Response.json({ results: filtered, latest, total: null, source: 'mfapi.in', fallback: true }, { headers });
  } catch (e) {
    const detail = `AMFI: ${amfiError}; mfapi.in: ${e instanceof Error ? e.message : e}`.slice(0, 300);
    return Response.json({ error: 'Mutual fund data temporarily unavailable', detail }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
