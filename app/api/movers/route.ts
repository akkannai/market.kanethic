import { getMovers } from '@/lib/movers';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json(await getMovers(), { headers: { 'Cache-Control': 'public, max-age=30' } });
  } catch {
    return Response.json({ error: 'Temporarily unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
