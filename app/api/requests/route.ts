import { NextRequest, NextResponse } from 'next/server';
import { checkSlot } from '@/lib/availability';
import { cancelBooking, moveBooking } from '@/lib/bookings';
import { findStudentBookings } from '@/lib/student';

// POST /api/requests  { name, pin, bookingId, type: 'reschedule' | 'cancel', start?, duration? }
// Changes or cancels a tutoring right away. New times are checked against blocked times first.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const found = await findStudentBookings(body.name, body.pin);
    if ('error' in found) return bad(found.error, 404);

    const booking = found.bookings.find((b) => b.id === body.bookingId);
    if (!booking) return bad("We couldn't find that tutoring.", 404);
    if (booking.status !== 'confirmed') return bad('This tutoring is already cancelled.');
    if (Date.parse(booking.start_at) <= Date.now()) return bad('This tutoring already started, so it can’t be changed.');

    if (body.type === 'cancel') {
      await cancelBooking(booking);
      return NextResponse.json({ ok: true });
    }
    if (body.type !== 'reschedule') return bad('Unknown request.');

    const start = Number(body.start);
    const duration = Number(body.duration);
    const end = start + duration * 60_000;
    if (start === Date.parse(booking.start_at) && end === Date.parse(booking.end_at)) {
      return bad('That’s the same time you already have.');
    }
    const problem = await checkSlot(start, duration, booking.id);
    if (problem) return bad(problem, 409);
    const taken = await moveBooking(booking, start, end);
    if (taken) return bad(taken, 409);
    return NextResponse.json({ ok: true, start, end });
  } catch (e) {
    console.error(e);
    return bad('Something went wrong. Please try again.', 500);
  }
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}
