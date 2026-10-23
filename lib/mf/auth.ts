import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Admin login (single admin): env ADMIN_USER, ADMIN_PASSWORD_HASH (scripts/hash-password.mjs), SESSION_SECRET (16+ chars)
const COOKIE = 'kmfi_admin';
export const cookieName = COOKIE;
const TTL_MS = 8 * 3600_000;
const secret = () => process.env.SESSION_SECRET || '';
export const adminConfigured = () => !!(process.env.ADMIN_USER && process.env.ADMIN_PASSWORD_HASH && secret().length >= 16);

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$${salt}$${scryptSync(pw, salt, 64).toString('hex')}`;
}
export function verifyPassword(pw: string, stored = process.env.ADMIN_PASSWORD_HASH || ''): boolean {
  const [alg, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const a = scryptSync(pw, salt, 64), b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
const sign = (v: string) => createHmac('sha256', secret()).update(v).digest('hex');
export function makeSession(user: string, now = Date.now()) {
  const body = `${Buffer.from(user).toString('base64url')}.${now + TTL_MS}`;
  return `${body}.${sign(body)}`;
}
export function verifySession(token: string | undefined, now = Date.now()): string | null {
  if (!token || !secret()) return null;
  const [u, exp, sig] = token.split('.');
  if (!u || !exp || !sig) return null;
  const good = sign(`${u}.${exp}`);
  if (sig.length !== good.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  if (Number(exp) < now) return null;
  return Buffer.from(u, 'base64url').toString();
}
export function sessionFrom(request: Request): string | null {
  const m = /(?:^|;\s*)kmfi_admin=([^;]+)/.exec(request.headers.get('cookie') ?? '');
  return verifySession(m ? decodeURIComponent(m[1]) : undefined);
}
export const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const attempts = new Map<string, number[]>();
export function loginAllowed(ip: string, now = Date.now()) {
  const list = (attempts.get(ip) ?? []).filter((t) => now - t < 15 * 60_000);
  attempts.set(ip, list);
  return list.length < 8;
}
export const noteFailedLogin = (ip: string) => attempts.set(ip, [...(attempts.get(ip) ?? []), Date.now()]);
/** CSRF: browser POST ni Origin host == request host hovi joie */
export function sameOrigin(request: Request) {
  const o = request.headers.get('origin');
  if (!o) return true; // curl/non-browser; cookie vagar admin kaam nahi kare
  try { return new URL(o).host === (request.headers.get('x-forwarded-host') ?? request.headers.get('host')); } catch { return false; }
}
