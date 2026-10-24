import { NextRequest, NextResponse } from 'next/server';
import { db, publicBooking, RequestRow } from '@/lib/db';
import { findStudentBookings } from '@/lib/student';

// POST /api/my  { name, pin } → the student's upcoming tutorings
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const found = await findStudentBookings(body.name, body.pin);
    if ('error' in found) return NextResponse.json({ error: found.error }, { status: 404 });

    const now = Date.now();
    const upcoming = found.bookings.filter((b) => Date.parse(b.end_at) > now);
    const ids = upcoming.map((b) => b.id);
    const { data: reqs, error } = ids.length
      ? await db().from('change_requests').select('*').in('booking_id', ids).neq('status', 'replaced').order('created_at', { ascending: false })
      : { data: [], error: null };
    if (error) throw error;

    const latest = new Map<string, RequestRow>();
    for (const r of (reqs ?? []) as RequestRow[]) if (!latest.has(r.booking_id)) latest.set(r.booking_id, r);

    return NextResponse.json({ bookings: upcoming.map((b) => publicBooking(b, latest.get(b.id))) });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
