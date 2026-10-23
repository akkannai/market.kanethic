import { adminConfigured, sameOrigin, sessionFrom } from '@/lib/mf/auth';
import { handle } from '@/lib/mf/api';
import { runBackfill, runNavFetch } from '@/lib/mf/jobs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const POST = (req: Request) => handle(async () => {
  if (!adminConfigured() || !sessionFrom(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!sameOrigin(req)) return Response.json({ error: 'Bad origin' }, { status: 403 });
  const { job } = await req.json().catch(() => ({}));
  if (job === 'nav-fetch') { runNavFetch({ trigger: 'manual' }).catch((e) => console.error(e)); return Response.json({ started: true, job }, { status: 202 }); }
  if (job === 'backfill') { runBackfill({ trigger: 'manual' }).catch((e) => console.error(e)); return Response.json({ started: true, job }, { status: 202 }); }
  return Response.json({ error: 'Unknown job' }, { status: 400 });
});
