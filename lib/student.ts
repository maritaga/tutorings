import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { db, BookingRow } from './db';

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pin, salt, 32).toString('hex')}`;
}

export function checkPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  return timingSafeEqual(scryptSync(pin, salt, 32), Buffer.from(hash, 'hex'));
}

export const isPin = (p: unknown): p is string => typeof p === 'string' && /^\d{4}$/.test(p);
export const isEmail = (e: unknown): e is string =>
  typeof e === 'string' && e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

export function cleanName(name: unknown): string {
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
}

/** "  José  Pérez " → "jose perez" so lookups ignore accents and capitals */
export function nameKey(name: string): string {
  return cleanName(name)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const MAX_FAILURES = 8;
const FAILURE_WINDOW_MS = 15 * 60_000;

/** Finds the bookings that belong to this name + PIN. Limits wrong PIN guesses. */
export async function findStudentBookings(
  rawName: unknown,
  pin: unknown,
): Promise<{ error: string } | { bookings: BookingRow[] }> {
  const name = cleanName(rawName);
  if (name.length < 2) return { error: 'Please write your name.' };
  if (!isPin(pin)) return { error: 'Your PIN has 4 digits.' };
  const key = nameKey(name);

  const since = new Date(Date.now() - FAILURE_WINDOW_MS).toISOString();
  const { count } = await db()
    .from('pin_failures')
    .select('id', { count: 'exact', head: true })
    .eq('name_key', key)
    .gte('at', since);
  if ((count ?? 0) >= MAX_FAILURES) {
    return { error: 'Too many wrong tries. Please wait 15 minutes and try again.' };
  }

  const { data, error } = await db().from('bookings').select('*').eq('name_key', key).order('start_at');
  if (error) throw error;
  const mine = (data as BookingRow[]).filter((b) => checkPin(pin, b.pin_hash));
  if (mine.length === 0) {
    await db().from('pin_failures').insert({ name_key: key });
    return { error: "We couldn't find tutorings with that name and PIN." };
  }
  return { bookings: mine };
}
