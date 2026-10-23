import { handle, json } from '@/lib/mf/api';
import { search } from '@/lib/mf/queries';
export const dynamic = 'force-dynamic';
export const GET = (req: Request) => handle(async () => {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 80);
  return json({ results: q.length >= 2 ? await search(q) : [] }, 30);
});
