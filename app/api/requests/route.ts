import { NextRequest, NextResponse } from 'next/server';
import { checkSlot } from '@/lib/availability';
import { db } from '@/lib/db';
import { findStudentBookings } from '@/lib/student';

// POST /api/requests  { name, pin, bookingId, type: 'reschedule' | 'cancel', start?, duration? }
// Saves a request for Marita to approve. Reschedules are checked against blocked times first.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const found = await findStudentBookings(body.name, body.pin);
    if ('error' in found) return bad(found.error, 404);

    const booking = found.bookings.find((b) => b.id === body.bookingId);
    if (!booking) return bad("We couldn't find that tutoring.", 404);
    if (booking.status !== 'confirmed') return bad('This tutoring is already cancelled.');
    if (Date.parse(booking.start_at) <= Date.now()) return bad('This tutoring already started, so it can’t be changed.');

    let newStart: string | null = null;
    let newEnd: string | null = null;

    if (body.type === 'reschedule') {
      const start = Number(body.start);
      const duration = Number(body.duration);
      const end = start + duration * 60_000;
      if (start === Date.parse(booking.start_at) && end === Date.parse(booking.end_at)) {
        return bad('That’s the same time you already have.');
      }
      const problem = await checkSlot(start, duration, booking.id);
      if (problem) return bad(problem, 409);
      newStart = new Date(start).toISOString();
      newEnd = new Date(end).toISOString();
    } else if (body.type !== 'cancel') {
      return bad('Unknown request.');
    }

    // Only one open request per tutoring: a new one replaces the old one
    const { error: e1 } = await db()
      .from('change_requests')
      .update({ status: 'replaced' })
      .eq('booking_id', booking.id)
      .eq('status', 'pending');
    if (e1) throw e1;
    const { error: e2 } = await db()
      .from('change_requests')
      .insert({ booking_id: booking.id, type: body.type, new_start: newStart, new_end: newEnd });
    if (e2) throw e2;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return bad('Something went wrong. Please try again.', 500);
  }
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}
