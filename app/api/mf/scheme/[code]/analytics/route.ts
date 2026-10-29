import { handle, json } from '@/lib/mf/api';
import { peerCompare, schemeAnalytics } from '@/lib/mf/queries';
export const dynamic = 'force-dynamic';

export const GET = (_req: Request, { params }: { params: Promise<{ code: string }> }) => handle(async () => {
  const { code } = await params;
  if (!/^\d{3,8}$/.test(code)) return json({ error: 'Bad request' }, 0, 400);
  const [a, peers] = await Promise.all([schemeAnalytics(Number(code), { series: true }), peerCompare(Number(code))]);
  if (!peers) return json({ error: 'Scheme not found' }, 0, 404);
  return json({ ...a, peers }, 300);
});
