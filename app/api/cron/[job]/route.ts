import { safeEqual } from '@/lib/mf/auth';
import { runBackfill, runMetrics, runNavFetch, runRecompute } from '@/lib/mf/jobs';
import type { Slot } from '@/lib/mf/calc';
import { DbNotConfigured, exec, q, utcNow } from '@/lib/mf/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Hostinger cron:  curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" "https://<domain>/api/cron/nav-fetch?slot=23:00"
// ?wait=1 -> result aave tya sudhi rah joyo (default: turant 202, job background ma chale)
export async function POST(req: Request, { params }: { params: Promise<{ job: string }> }) {
  const { job } = await params;
  const secret = process.env.CRON_SECRET || '';
  const given = /^Bearer (.+)$/.exec(req.headers.get('authorization') ?? '')?.[1] ?? '';
  if (secret.length < 16 || !safeEqual(given, secret)) {
    // Rejected cron call admin ma dekhay e mate (30 min ma ek j noond; DB na hoy to chup-chap chhodo)
    try {
      const [r] = await q<{ n: number }>("SELECT COUNT(*) n FROM job_runs WHERE job='cron-auth' AND started_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 MINUTE)");
      if (!r?.n) await exec("INSERT INTO job_runs (job, trigger_by, started_at, finished_at, status, message) VALUES ('cron-auth','cron',?,?,'failed',?)", [utcNow(), utcNow(), secret.length < 16 ? 'Cron call rejected: CRON_SECRET is missing/short in the app environment' : given ? 'Cron call rejected: Authorization secret does not match CRON_SECRET' : 'Cron call rejected: no Authorization header (is the -H "Authorization: Bearer ..." part in the command?)']);
    } catch { /* ignore */ }
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sp = new URL(req.url).searchParams;
  const slot = (['23:00', '23:45', '07:00', '10:00'].includes(sp.get('slot') ?? '') ? sp.get('slot') : null) as Slot | null;
  let run: () => Promise<unknown>;
  if (job === 'nav-fetch') run = () => runNavFetch({ slot, trigger: 'cron' });
  else if (job === 'backfill') run = () => runBackfill({ trigger: 'cron' });
  else if (job === 'recompute') run = () => runRecompute({ trigger: 'cron' });
  else if (job === 'metrics') run = () => runMetrics({ trigger: 'cron' });
  else return Response.json({ error: 'Unknown job' }, { status: 404 });
  try {
    if (sp.get('wait') === '1') return Response.json(await run());
    run().catch((e) => console.error('[cron]', job, e));
    return Response.json({ started: true, job, slot }, { status: 202 });
  } catch (e) {
    if (e instanceof DbNotConfigured) return Response.json({ error: e.message }, { status: 503 });
    return Response.json({ error: 'Job error' }, { status: 500 });
  }
}
