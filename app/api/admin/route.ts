import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { checkSlot } from '@/lib/availability';
import { BookingRow, db, deleteSetting, getHours, RequestRow, setSetting } from '@/lib/db';
import { clearGoogleCache, deleteTutoringEvent, googleConfigured, googleConnected, moveTutoringEvent } from '@/lib/google';
import { Hours, isDate, localToUtc } from '@/lib/time';

export const dynamic = 'force-dynamic';

// GET /api/admin → everything the admin page shows
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  try {
    const nowIso = new Date().toISOString();
    const [requests, bookings, blocks, weekly, hours, connected] = await Promise.all([
      db().from('change_requests').select('*, booking:bookings(*)').eq('status', 'pending').order('created_at'),
      db().from('bookings').select('*').eq('status', 'confirmed').gt('end_at', nowIso).order('start_at'),
      db().from('blocks').select('*').gt('end_at', nowIso).order('start_at'),
      db().from('weekly_blocks').select('*').order('weekday').order('start_min'),
      getHours(),
      googleConnected(),
    ]);
    for (const r of [requests, bookings, blocks, weekly]) if (r.error) throw r.error;

    const toPublic = (b: BookingRow) => ({
      id: b.id,
      name: b.name,
      email: b.email,
      start: Date.parse(b.start_at),
      end: Date.parse(b.end_at),
      inCalendar: Boolean(b.google_event_id),
    });

    return NextResponse.json({
      google: { configured: googleConfigured(), connected },
      requests: (requests.data as (RequestRow & { booking: BookingRow })[]).map((r) => ({
        id: r.id,
        type: r.type,
        newStart: r.new_start ? Date.parse(r.new_start) : null,
        newEnd: r.new_end ? Date.parse(r.new_end) : null,
        booking: toPublic(r.booking),
      })),
      bookings: (bookings.data as BookingRow[]).map(toPublic),
      blocks: (blocks.data ?? []).map((b) => ({ id: b.id, label: b.label, start: Date.parse(b.start_at), end: Date.parse(b.end_at) })),
      weekly: weekly.data,
      hours,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: errorText(e) }, { status: 500 });
  }
}

// POST /api/admin  { action, ... }
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    switch (body.action) {
      case 'approve':
        return await approve(String(body.id));
      case 'reject': {
        const { error } = await db().from('change_requests').update({ status: 'rejected' }).eq('id', body.id).eq('status', 'pending');
        if (error) throw error;
        return ok();
      }
      case 'cancelBooking': {
        const b = await getBooking(String(body.id));
        if (!b) return bad('Tutoring not found.');
        await cancelBooking(b);
        return ok();
      }
      case 'addBlock': {
        const { date, from, to, label } = body;
        if (!isDate(date) || !validMin(from) || !validMin(to) || to <= from) return bad('Check the date and times.');
        const { error } = await db().from('blocks').insert({
          start_at: new Date(localToUtc(date, from)).toISOString(),
          end_at: new Date(localToUtc(date, to)).toISOString(),
          label: String(label ?? '').slice(0, 100),
        });
        if (error) throw error;
        return ok();
      }
      case 'deleteBlock': {
        const { error } = await db().from('blocks').delete().eq('id', body.id);
        if (error) throw error;
        return ok();
      }
      case 'addWeekly': {
        const { weekday, from, to, label } = body;
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6 || !validMin(from) || !validMin(to) || to <= from) {
          return bad('Check the day and times.');
        }
        const { error } = await db().from('weekly_blocks').insert({ weekday, start_min: from, end_min: to, label: String(label ?? '').slice(0, 100) });
        if (error) throw error;
        return ok();
      }
      case 'deleteWeekly': {
        const { error } = await db().from('weekly_blocks').delete().eq('id', body.id);
        if (error) throw error;
        return ok();
      }
      case 'saveHours': {
        const hours = body.hours as Hours;
        const valid =
          Array.isArray(hours) &&
          hours.length === 7 &&
          hours.every((h) => h === null || (validMin(h.open) && validMin(h.lastStart) && h.open <= h.lastStart));
        if (!valid) return bad('Check the hours: the first start must be before the last start.');
        await setSetting('hours', hours);
        return ok();
      }
      case 'disconnectGoogle':
        await deleteSetting('google');
        clearGoogleCache();
        return ok();
      default:
        return bad('Unknown action.');
    }
  } catch (e) {
    console.error(e);
    return bad(errorText(e), 500);
  }
}

async function approve(id: string) {
  const { data, error } = await db().from('change_requests').select('*').eq('id', id).eq('status', 'pending').maybeSingle();
  if (error) throw error;
  const request = data as RequestRow | null;
  if (!request) return bad('That request was already handled.');
  const booking = await getBooking(request.booking_id);
  if (!booking || booking.status !== 'confirmed') return bad('That tutoring is already cancelled.');

  if (request.type === 'cancel') {
    await cancelBooking(booking);
  } else {
    const start = Date.parse(request.new_start!);
    const end = Date.parse(request.new_end!);
    const problem = await checkSlot(start, (end - start) / 60_000, booking.id);
    if (problem) return bad(`Can't approve: ${problem}`);
    const { error: e } = await db().from('bookings').update({ start_at: request.new_start, end_at: request.new_end }).eq('id', booking.id);
    if (e) {
      if (e.code === '23P01') return bad("Can't approve: that time now overlaps another tutoring.");
      throw e;
    }
    if (booking.google_event_id) await moveTutoringEvent(booking.google_event_id, start, end);
  }
  const { error: e2 } = await db().from('change_requests').update({ status: 'approved' }).eq('id', id);
  if (e2) throw e2;
  return ok();
}

async function getBooking(id: string) {
  const { data, error } = await db().from('bookings').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as BookingRow | null;
}

async function cancelBooking(b: BookingRow) {
  const { error } = await db().from('bookings').update({ status: 'cancelled' }).eq('id', b.id);
  if (error) throw error;
  await db().from('change_requests').update({ status: 'rejected' }).eq('booking_id', b.id).eq('status', 'pending');
  if (b.google_event_id) await deleteTutoringEvent(b.google_event_id);
}

function validMin(v: unknown): v is number {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1440;
}
function ok() {
  return NextResponse.json({ ok: true });
}
function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}
function errorText(e: unknown) {
  return e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : 'Something went wrong.';
}
