import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { exchangeCode, saveRefreshToken } from '@/lib/google';

// Google sends Marita back here after she allows access
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const params = req.nextUrl.searchParams;
  const state = req.cookies.get('google_state')?.value;
  const done = (status: string) => {
    const res = NextResponse.redirect(`${origin}/admin?google=${status}`);
    res.cookies.delete('google_state');
    return res;
  };

  if (!(await isAdmin())) return NextResponse.redirect(`${origin}/admin`);
  if (!state || params.get('state') !== state) return done('error');
  const code = params.get('code');
  if (!code) return done('error');

  const refreshToken = await exchangeCode(code, `${origin}/api/google/callback`);
  if (!refreshToken) return done('error');
  await saveRefreshToken(refreshToken);
  return done('connected');
}
