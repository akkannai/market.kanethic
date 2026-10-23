import { DbNotConfigured } from './db.ts';

export function json(data: unknown, maxAge = 60, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': status === 200 ? `public, max-age=${maxAge}, s-maxage=${maxAge}` : 'no-store' } });
}
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DbNotConfigured) return Response.json({ error: e.message, code: 'db_not_configured' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    console.error('[mf-api]', e);
    return Response.json({ error: 'Data temporarily unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
export const intParam = (v: string | null, d: number, min = 1, max = 1_000_000) => Math.min(max, Math.max(min, Number.parseInt(v ?? '', 10) || d));
