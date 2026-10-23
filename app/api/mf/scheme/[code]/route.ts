import { handle, json } from '@/lib/mf/api';
import { history, isRange, schemeDetail, status } from '@/lib/mf/queries';
export const dynamic = 'force-dynamic';

export const GET = (req: Request, { params }: { params: Promise<{ code: string }> }) => handle(async () => {
  const { code } = await params;
  if (!/^\d{3,8}$/.test(code)) return json({ error: 'Bad request' }, 0, 400);
  const range = new URL(req.url).searchParams.get('range') ?? '1y';
  if (!isRange(range)) return json({ error: 'Bad range' }, 0, 400);
  const s = await schemeDetail(Number(code));
  if (!s) return json({ error: 'Scheme not found' }, 0, 404);
  const [points, st] = await Promise.all([history(Number(code), range), status()]);
  return json({ scheme: s, range, points, status: st }, 60);
});
