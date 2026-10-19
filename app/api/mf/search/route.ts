import { getFunds, searchFunds } from '@/lib/amfi';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const q = (sp.get('q') ?? '').slice(0, 80);
  const plan = sp.get('plan');
  const option = sp.get('option');
  try {
    const { funds, latest, at } = await getFunds();
    const results = searchFunds(funds, latest, q, {
      plan: plan === 'direct' || plan === 'regular' ? plan : undefined,
      option: option === 'growth' || option === 'idcw' ? option : undefined,
      limit: 30,
    });
    return Response.json({ results, latest, total: funds.length, at }, { headers: { 'Cache-Control': 'public, max-age=60' } });
  } catch {
    return Response.json({ error: 'AMFI data temporarily unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
