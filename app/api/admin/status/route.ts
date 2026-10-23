import { adminConfigured, sessionFrom } from '@/lib/mf/auth';
import { handle } from '@/lib/mf/api';
import { adminOverview } from '@/lib/mf/queries';
import { alertTo, mailConfigured } from '@/lib/mf/mail';
export const dynamic = 'force-dynamic';

export const GET = (req: Request) => handle(async () => {
  if (!adminConfigured()) return Response.json({ error: 'Admin not configured' }, { status: 503 });
  if (!sessionFrom(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const o = await adminOverview();
  return Response.json({ ...o, config: { mail: mailConfigured(), alertTo: alertTo(), cronSecret: (process.env.CRON_SECRET ?? '').length >= 16, tz: Intl.DateTimeFormat().resolvedOptions().timeZone } }, { headers: { 'Cache-Control': 'no-store' } });
});
