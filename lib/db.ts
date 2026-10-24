import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Hours } from './time';

let client: SupabaseClient | null = null;

/** Server-only database client. Uses the secret key, so never import this in the browser. */
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY');
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}

export type BookingRow = {
  id: string;
  name: string;
  name_key: string;
  email: string;
  pin_hash: string;
  start_at: string;
  end_at: string;
  status: 'confirmed' | 'cancelled';
  google_event_id: string | null;
  created_at: string;
};

export type RequestRow = {
  id: string;
  booking_id: string;
  type: 'reschedule' | 'cancel';
  new_start: string | null;
  new_end: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'replaced';
  created_at: string;
};

export const DEFAULT_HOURS: Hours = [
  { open: 660, lastStart: 1260 },
  { open: 420, lastStart: 1260 },
  { open: 420, lastStart: 1260 },
  { open: 420, lastStart: 1260 },
  { open: 420, lastStart: 1260 },
  { open: 420, lastStart: 1260 },
  { open: 660, lastStart: 1260 },
];

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data, error } = await db().from('settings').select('value').eq('key', key).maybeSingle();
  if (error) throw error;
  return (data?.value as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown) {
  const { error } = await db().from('settings').upsert({ key, value });
  if (error) throw error;
}

export async function deleteSetting(key: string) {
  const { error } = await db().from('settings').delete().eq('key', key);
  if (error) throw error;
}

export function getHours() {
  return getSetting<Hours>('hours', DEFAULT_HOURS);
}

/** What students are allowed to see about a booking */
export function publicBooking(b: BookingRow, req?: RequestRow | null) {
  return {
    id: b.id,
    name: b.name,
    start: Date.parse(b.start_at),
    end: Date.parse(b.end_at),
    status: b.status,
    request: req
      ? {
          type: req.type,
          status: req.status,
          newStart: req.new_start ? Date.parse(req.new_start) : null,
          newEnd: req.new_end ? Date.parse(req.new_end) : null,
        }
      : null,
  };
}
export type PublicBooking = ReturnType<typeof publicBooking>;
