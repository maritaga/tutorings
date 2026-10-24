import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';

export const ADMIN_COOKIE = 'admin_session';
export const SESSION_DAYS = 30;

function password(): string {
  const p = process.env.ADMIN_PASSWORD;
  if (!p) throw new Error('Missing ADMIN_PASSWORD');
  return p;
}

function sign(exp: string) {
  return createHmac('sha256', password()).update(`admin:${exp}`).digest('hex');
}

function same(a: string, b: string) {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(p: unknown): boolean {
  return typeof p === 'string' && same(p, password());
}

export function makeSession(): string {
  const exp = String(Date.now() + SESSION_DAYS * 86_400_000);
  return `${exp}.${sign(exp)}`;
}

export async function isAdmin(): Promise<boolean> {
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!value) return false;
  const [exp, sig] = value.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return same(sig, sign(exp));
}
