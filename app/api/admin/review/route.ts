import { adminConfigured, sameOrigin, sessionFrom } from '@/lib/mf/auth';
import { handle } from '@/lib/mf/api';
import { reviewAction } from '@/lib/mf/jobs';
export const dynamic = 'force-dynamic';

export const POST = (req: Request) => handle(async () => {
  if (!adminConfigured() || !sessionFrom(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!sameOrigin(req)) return Response.json({ error: 'Bad origin' }, { status: 403 });
  const { id, action } = await req.json().catch(() => ({}));
  if (!Number.isInteger(id) || !['approve', 'reject'].includes(action)) return Response.json({ error: 'Bad request' }, { status: 400 });
  return Response.json({ ok: await reviewAction(id, action) });
});
