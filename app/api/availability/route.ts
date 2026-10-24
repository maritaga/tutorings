import { NextRequest, NextResponse } from 'next/server';
import { getBusy } from '@/lib/availability';
import { getHours } from '@/lib/db';
import { addDays, isDate, localToUtc, todayLocal, WEEKS_AHEAD } from '@/lib/time';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f-]{36}$/i;

// GET /api/availability?week=2026-11-01[&exclude=<bookingId>]
// Returns tutoring hours and busy intervals (no details) for that week.
export async function GET(req: NextRequest) {
  try {
    const week = req.nextUrl.searchParams.get('week');
    const exclude = req.nextUrl.searchParams.get('exclude') ?? undefined;
    if (!isDate(week)) return NextResponse.json({ error: 'Invalid week' }, { status: 400 });
    if (exclude && !UUID.test(exclude)) return NextResponse.json({ error: 'Invalid booking' }, { status: 400 });

    const from = localToUtc(week, 0);
    const to = localToUtc(addDays(week, 8), 0); // one extra day for tutorings that end after midnight
    const [hours, busy] = await Promise.all([getHours(), getBusy(from, to, exclude)]);
    const today = todayLocal();
    return NextResponse.json({
      week,
      today,
      now: Date.now(),
      maxDate: addDays(today, WEEKS_AHEAD * 7),
      hours,
      busy,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Could not load the calendar. Please try again.' }, { status: 500 });
  }
}
