import { pool } from '@/lib/cache';
import { getNavMetrics, isSchemeCode } from '@/lib/mfapi';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const codes = [...new Set((new URL(request.url).searchParams.get('codes') ?? '').split(',').filter(isSchemeCode))].slice(0, 40);
  if (!codes.length) return Response.json({ error: 'Bad request' }, { status: 400 });
  const rows = await pool(codes, 8, getNavMetrics);
  return Response.json({ metrics: Object.fromEntries(codes.map((c, i) => [c, rows[i] ?? null])) }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
