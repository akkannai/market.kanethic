import { handle, json } from '@/lib/mf/api';
import { compare, isRange, status } from '@/lib/mf/queries';
export const dynamic = 'force-dynamic';

export const GET = (req: Request) => handle(async () => {
  const sp = new URL(req.url).searchParams;
  const codes = (sp.get('codes') ?? '').split(',').map((c) => c.trim()).filter((c) => /^\d{3,8}$/.test(c)).map(Number).slice(0, 5);
  const range = sp.get('range') ?? '3y';
  if (!isRange(range)) return json({ error: 'Bad range' }, 0, 400);
  if (!codes.length) return json({ schemes: [], rows: [], startDate: null, status: await status() }, 30);
  return json({ ...(await compare(codes, range)), range, status: await status() }, 60);
});
