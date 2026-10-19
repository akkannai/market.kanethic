import { healthSnapshot } from '@/lib/health';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ now: Date.now(), sources: healthSnapshot() }, { headers: { 'Cache-Control': 'no-store' } });
}
