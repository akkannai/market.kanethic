import { handle, intParam, json } from '@/lib/mf/api';
import { listSchemes } from '@/lib/mf/queries';
export const dynamic = 'force-dynamic';
export const GET = (req: Request) => handle(async () => {
  const sp = new URL(req.url).searchParams;
  const page = intParam(sp.get('page'), 1), pageSize = intParam(sp.get('pageSize'), 50, 1, 200);
  const r = await listSchemes({
    q: (sp.get('q') ?? '').slice(0, 80), amc: sp.get('amc') ?? undefined, main: sp.get('main') ?? undefined, cat: sp.get('cat') ?? undefined,
    plan: sp.get('plan') ?? 'Regular', opt: sp.get('opt') ?? 'Growth', move: sp.get('move') ?? undefined, sort: sp.get('sort') ?? undefined, dir: sp.get('dir') ?? undefined, page, pageSize,
  });
  return json({ ...r, page, pageSize }, 60);
});
