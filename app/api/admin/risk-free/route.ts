import { adminConfigured, sameOrigin, sessionFrom } from '@/lib/mf/auth';
import { handle } from '@/lib/mf/api';
import { runMetrics } from '@/lib/mf/jobs';
import { setRiskFree, validateRiskFree } from '@/lib/mf/settings';
export const dynamic = 'force-dynamic';

export const POST = (req: Request) => handle(async () => {
  if (!adminConfigured() || !sessionFrom(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!sameOrigin(req)) return Response.json({ error: 'Bad origin' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const v = validateRiskFree(b.pct, b.asOf, b.note);
  if (typeof v === 'string') return Response.json({ error: v }, { status: 400 });
  await setRiskFree(v);
  runMetrics({ trigger: 'manual' }).catch((e) => console.error(e)); // naya rate thi badha Sharpe/Sortino pharithi
  return Response.json({ ok: true, ...v });
});
