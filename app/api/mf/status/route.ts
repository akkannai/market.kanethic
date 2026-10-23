import { handle, json } from '@/lib/mf/api';
import { status } from '@/lib/mf/queries';
export const dynamic = 'force-dynamic';
export const GET = () => handle(async () => json(await status(), 30));
