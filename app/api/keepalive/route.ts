import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Vercel calls this once a day (see vercel.json) so the free Supabase project never pauses.
export async function GET() {
  const { error } = await db().from('settings').select('key').limit(1);
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}
