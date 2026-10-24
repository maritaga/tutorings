import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE, checkPassword, makeSession, SESSION_DAYS } from '@/lib/admin';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'ADMIN_PASSWORD is not set in Vercel yet.' }, { status: 500 });
  }
  if (!checkPassword(body.password)) {
    await new Promise((r) => setTimeout(r, 800)); // slows down guessing
    return NextResponse.json({ error: 'Wrong password.' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, makeSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
  return res;
}
