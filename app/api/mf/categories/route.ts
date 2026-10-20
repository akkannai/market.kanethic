import { getFunds, listCategories } from '@/lib/amfi';
import { mfPlan } from '@/lib/mfplan';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const option = new URL(request.url).searchParams.get('option');
  try {
    const { funds, latest } = await getFunds();
    return Response.json({ categories: listCategories(funds, latest, mfPlan(), option === 'idcw' ? 'idcw' : 'growth'), latest }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch {
    return Response.json({ error: 'Categories unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
