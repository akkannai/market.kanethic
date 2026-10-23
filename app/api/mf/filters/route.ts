import { handle, json } from '@/lib/mf/api';
import { filterOptions } from '@/lib/mf/queries';
export const dynamic = 'force-dynamic';
export const GET = () => handle(async () => json(await filterOptions(), 300));
