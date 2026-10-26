import { BookingRow, db } from './db';
import { deleteTutoringEvent, moveTutoringEvent } from './google';

/** Moves a tutoring to a new time (already checked) and updates Google Calendar. Returns an error message or null. */
export async function moveBooking(b: BookingRow, start: number, end: number): Promise<string | null> {
  const { error } = await db()
    .from('bookings')
    .update({ start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString() })
    .eq('id', b.id);
  if (error) {
    if (error.code === '23P01') return 'Sorry, someone just booked that time. Please pick another one.';
    throw error;
  }
  if (b.google_event_id) await moveTutoringEvent(b.google_event_id, start, end);
  await log(b.id, 'reschedule', start, end);
  return null;
}

/** Cancels a tutoring and removes it from Google Calendar (the student gets a cancellation email). */
export async function cancelBooking(b: BookingRow) {
  const { error } = await db().from('bookings').update({ status: 'cancelled' }).eq('id', b.id);
  if (error) throw error;
  if (b.google_event_id) await deleteTutoringEvent(b.google_event_id);
  await log(b.id, 'cancel');
}

// Keeps a history of changes in the change_requests table
async function log(bookingId: string, type: 'reschedule' | 'cancel', start?: number, end?: number) {
  await db()
    .from('change_requests')
    .insert({
      booking_id: bookingId,
      type,
      new_start: start ? new Date(start).toISOString() : null,
      new_end: end ? new Date(end).toISOString() : null,
      status: 'approved',
    });
}
