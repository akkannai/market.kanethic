import { ensureCollector, getAllQuotes } from '@/lib/quotes';
import { cached } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  ensureCollector(() => cached('all-quotes', 20_000, getAllQuotes));
  try {
    const { value, at, stale } = await cached('all-quotes', 20_000, getAllQuotes);
    return Response.json(
      { ...value, updated: at, stale },
      { headers: { 'Cache-Control': 'public, max-age=10' } },
    );
  } catch (e) {
    return Response.json({ error: 'Market data temporarily unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
