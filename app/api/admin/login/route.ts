import { adminConfigured, cookieName, loginAllowed, makeSession, noteFailedLogin, safeEqual, sameOrigin, verifyPassword } from '@/lib/mf/auth';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!adminConfigured()) return Response.json({ error: 'Admin not configured (ADMIN_USER, ADMIN_PASSWORD_HASH, SESSION_SECRET)' }, { status: 503 });
  if (!sameOrigin(req)) return Response.json({ error: 'Bad origin' }, { status: 403 });
  const ip = (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  if (!loginAllowed(ip)) return Response.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const user = String(body.user ?? ''), pw = String(body.password ?? '');
  const ok = safeEqual(user.padEnd(64).slice(0, 64), String(process.env.ADMIN_USER).padEnd(64).slice(0, 64)) && verifyPassword(pw);
  if (!ok) { noteFailedLogin(ip); return Response.json({ error: 'Wrong user or password' }, { status: 401 }); }
  const secure = (req.headers.get('x-forwarded-proto') ?? new URL(req.url).protocol.replace(':', '')) === 'https';
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': `${cookieName}=${encodeURIComponent(makeSession(user))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800${secure ? '; Secure' : ''}` } });
}
