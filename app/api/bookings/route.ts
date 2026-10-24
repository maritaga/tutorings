import { NextRequest, NextResponse } from 'next/server';
import { checkSlot } from '@/lib/availability';
import { BookingRow, db, publicBooking } from '@/lib/db';
import { createTutoringEvent } from '@/lib/google';
import { cleanName, hashPin, isEmail, isPin, nameKey } from '@/lib/student';

// POST /api/bookings  { name, email, pin, start (ms), duration (min) }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = cleanName(body.name);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const start = Number(body.start);
    const duration = Number(body.duration);

    if (name.length < 2) return bad('Please write your name.');
    if (!isEmail(email)) return bad('Please write a valid email.');
    if (!isPin(body.pin)) return bad('Choose a 4-digit PIN (numbers only).');

    const problem = await checkSlot(start, duration);
    if (problem) return bad(problem, 409);

    const end = start + duration * 60_000;
    const { data, error } = await db()
      .from('bookings')
      .insert({
        name,
        name_key: nameKey(name),
        email,
        pin_hash: hashPin(body.pin),
        start_at: new Date(start).toISOString(),
        end_at: new Date(end).toISOString(),
      })
      .select('*')
      .single();
    if (error) {
      if (error.code === '23P01') return bad('Sorry, someone just booked that time. Please pick another one.', 409);
      throw error;
    }
    const booking = data as BookingRow;

    const eventId = await createTutoringEvent({ id: booking.id, name, email, start, end });
    if (eventId) await db().from('bookings').update({ google_event_id: eventId }).eq('id', booking.id);

    return NextResponse.json({ booking: publicBooking(booking) });
  } catch (e) {
    console.error(e);
    return bad('Something went wrong. Please try again.', 500);
  }
}

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}
