import { db, getHours } from './db';
import { googleBusy } from './google';
import {
  addDays,
  DURATIONS,
  localToUtc,
  overlaps,
  STEP_MIN,
  todayLocal,
  utcToLocal,
  WEEKS_AHEAD,
} from './time';

type WeeklyBlock = { weekday: number; start_min: number; end_min: number };

/**
 * Every busy interval (UTC ms) between `fromMs` and `toMs`:
 * weekly classes, one-off blocks, confirmed tutorings, pending change requests and Google Calendar.
 * `excludeBookingId` ignores one tutoring (and its requests), so a student can move it to an overlapping time.
 */
export async function getBusy(fromMs: number, toMs: number, excludeBookingId?: string) {
  const fromIso = new Date(fromMs).toISOString();
  const toIso = new Date(toMs).toISOString();

  let bookingsQ = db()
    .from('bookings')
    .select('id,start_at,end_at')
    .eq('status', 'confirmed')
    .lt('start_at', toIso)
    .gt('end_at', fromIso);
  if (excludeBookingId) bookingsQ = bookingsQ.neq('id', excludeBookingId);

  let requestsQ = db()
    .from('change_requests')
    .select('booking_id,new_start,new_end')
    .eq('status', 'pending')
    .eq('type', 'reschedule')
    .lt('new_start', toIso)
    .gt('new_end', fromIso);
  if (excludeBookingId) requestsQ = requestsQ.neq('booking_id', excludeBookingId);

  const [weekly, blocks, bookings, requests, google] = await Promise.all([
    db().from('weekly_blocks').select('weekday,start_min,end_min'),
    db().from('blocks').select('start_at,end_at').lt('start_at', toIso).gt('end_at', fromIso),
    bookingsQ,
    requestsQ,
    googleBusy(fromMs, toMs),
  ]);
  for (const r of [weekly, blocks, bookings, requests]) if (r.error) throw r.error;

  const busy: [number, number][] = [];

  // Weekly classes, repeated for every day in the range
  const lastDate = utcToLocal(toMs).date;
  for (let d = addDays(utcToLocal(fromMs).date, -1); d <= lastDate; d = addDays(d, 1)) {
    const wd = utcToLocal(localToUtc(d, 0)).weekday;
    for (const w of weekly.data as WeeklyBlock[]) {
      if (w.weekday === wd) busy.push([localToUtc(d, w.start_min), localToUtc(d, w.end_min)]);
    }
  }
  for (const b of blocks.data ?? []) busy.push([Date.parse(b.start_at), Date.parse(b.end_at)]);
  for (const b of bookings.data ?? []) busy.push([Date.parse(b.start_at), Date.parse(b.end_at)]);
  for (const r of requests.data ?? []) busy.push([Date.parse(r.new_start), Date.parse(r.new_end)]);
  busy.push(...google);

  return busy.filter(([s, e]) => overlaps(s, e, fromMs, toMs));
}

/** Checks a time a student picked. Returns a message if it's not allowed, or null if it's fine. */
export async function checkSlot(start: number, duration: number, excludeBookingId?: string): Promise<string | null> {
  if (!Number.isFinite(start)) return 'Please choose a start time.';
  if (!DURATIONS.includes(duration)) return 'Tutorings can last from 1 to 3.5 hours.';
  const local = utcToLocal(start);
  if (local.minutes % STEP_MIN !== 0) return 'Tutorings start on the hour or half hour.';
  if (start <= Date.now()) return 'That time has already passed. Please pick another one.';
  if (local.date > addDays(todayLocal(), WEEKS_AHEAD * 7)) return `You can book up to ${WEEKS_AHEAD} weeks ahead.`;

  const hours = (await getHours())[local.weekday];
  if (!hours || local.minutes < hours.open || local.minutes > hours.lastStart) {
    return "That's outside tutoring hours. Please pick another time.";
  }

  const end = start + duration * 60_000;
  const busy = await getBusy(start, end, excludeBookingId);
  if (busy.length > 0) {
    return "That time isn't available. It overlaps a class, another tutoring or a blocked time. Please pick another one.";
  }
  return null;
}
