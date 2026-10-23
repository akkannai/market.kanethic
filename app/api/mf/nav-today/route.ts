import { handle, json } from '@/lib/mf/api';
import { movers, status } from '@/lib/mf/queries';
export const dynamic = 'force-dynamic';
export const GET = () => handle(async () => json({ ...(await movers()), status: await status() }, 60));
