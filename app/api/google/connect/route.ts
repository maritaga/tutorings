import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { GOOGLE_SCOPE, googleConfigured } from '@/lib/google';

// Sends Marita to Google's "allow access to your calendar" screen
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  if (!(await isAdmin())) return NextResponse.redirect(`${origin}/admin`);
  if (!googleConfigured()) return NextResponse.redirect(`${origin}/admin?google=missing`);

  const state = randomBytes(16).toString('hex');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${origin}/api/google/callback`,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  }).toString();

  const res = NextResponse.redirect(url.toString());
  res.cookies.set('google_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return res;
}
