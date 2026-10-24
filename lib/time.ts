// Time helpers shared by the browser and the server.
// Everything is in Mexico City time, which is UTC-6 all year (no daylight saving since 2022).

export const TIMEZONE = 'America/Mexico_City';
const OFFSET_MS = 6 * 60 * 60 * 1000;

export const DURATIONS = [60, 90, 120, 150, 180, 210]; // minutes: 1h … 3.5h
export const STEP_MIN = 30;
export const WEEKS_AHEAD = 12;

export type DayHours = { open: number; lastStart: number } | null;
export type Hours = DayHours[]; // index 0 = Sunday

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

/** "2026-11-02" + 540 minutes (9:00) → UTC milliseconds */
export function localToUtc(date: string, minutes: number): number {
  const { y, m, d } = parts(date);
  return Date.UTC(y, m - 1, d) + minutes * 60_000 + OFFSET_MS;
}

/** UTC milliseconds → local date, minutes after midnight and weekday */
export function utcToLocal(ms: number) {
  const t = new Date(ms - OFFSET_MS);
  return {
    date: t.toISOString().slice(0, 10),
    minutes: t.getUTCHours() * 60 + t.getUTCMinutes(),
    weekday: t.getUTCDay(),
  };
}

export function addDays(date: string, n: number): string {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The Sunday that starts the week containing `date` */
export function weekStartOf(date: string): string {
  return addDays(date, -weekdayOf(date));
}

export function todayLocal(): string {
  return utcToLocal(Date.now()).date;
}

export function isDate(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function overlaps(a0: number, a1: number, b0: number, b1: number) {
  return a0 < b1 && b0 < a1;
}

/** 900 → "3:00 pm" */
export function fmtTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${h < 12 ? 'am' : 'pm'}`;
}

/** "2026-11-02" → "Mon, Nov 2" */
export function fmtDate(date: string, long = false): string {
  const { m, d } = parts(date);
  const wd = weekdayOf(date);
  return `${long ? DAY_LONG[wd] : DAY_SHORT[wd]}, ${MONTHS[m - 1]} ${d}`;
}

export function fmtMonthDay(date: string): string {
  const { m, d } = parts(date);
  return `${MONTHS[m - 1]} ${d}`;
}

/** UTC range → "Mon, Nov 2 · 3:00 pm – 5:00 pm" */
export function fmtRange(startMs: number, endMs: number, long = false): string {
  const s = utcToLocal(startMs);
  const e = utcToLocal(endMs);
  return `${fmtDate(s.date, long)} · ${fmtTime(s.minutes)} – ${fmtTime(e.minutes)}`;
}

/** 90 → "1.5 h" */
export function fmtDuration(minutes: number): string {
  return `${minutes / 60} h`;
}

/** "HH:MM" ↔ minutes, for <input type="time"> */
export function hhmmToMin(v: string): number {
  const [h, m] = v.split(':').map(Number);
  return h * 60 + m;
}
export function minToHhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
