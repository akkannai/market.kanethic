import { handle, json } from '@/lib/mf/api';
import { categoriesList, status } from '@/lib/mf/queries';
export const dynamic = 'force-dynamic';
export const GET = () => handle(async () => json({ categories: await categoriesList(), status: await status() }, 60));
