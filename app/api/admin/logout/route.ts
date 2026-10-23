import { cookieName } from '@/lib/mf/auth';
export const dynamic = 'force-dynamic';
export async function POST() {
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` } });
}
