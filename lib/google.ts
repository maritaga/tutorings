// Google Calendar, connected through Marita's own Google account (OAuth).
// Used to: block times when she is busy, and add tutorings as events (inviting the student).
import { getSetting, setSetting } from './db';
import { TIMEZONE, utcToLocal, localToUtc } from './time';

export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const API = 'https://www.googleapis.com/calendar/v3';

type GoogleSetting = { refresh_token: string; connected_at: string };

let cached: { token: string; expires: number } | null = null;

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function calendarId() {
  return encodeURIComponent(process.env.GOOGLE_CALENDAR_ID || 'primary');
}

export async function googleConnected(): Promise<boolean> {
  const g = await getSetting<GoogleSetting | null>('google', null);
  return Boolean(g?.refresh_token);
}

export function clearGoogleCache() {
  cached = null;
}

export async function saveRefreshToken(refresh_token: string) {
  await setSetting('google', { refresh_token, connected_at: new Date().toISOString() });
  cached = null;
}

/** Returns an access token, or null if Google isn't set up / connected. */
async function accessToken(): Promise<string | null> {
  if (!googleConfigured()) return null;
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const g = await getSetting<GoogleSetting | null>('google', null);
  if (!g?.refresh_token) return null;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: g.refresh_token,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });
  if (!res.ok) {
    console.error('Google token refresh failed', res.status, await res.text());
    return null;
  }
  const json = await res.json();
  cached = { token: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return cached.token;
}

async function call(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  if (!token) return null;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers },
    cache: 'no-store',
  });
  if (!res.ok && res.status !== 410 && res.status !== 404) {
    console.error('Google Calendar error', path, res.status, await res.text());
    return null;
  }
  return res;
}

/** Exchanges the code from Google's consent screen for a refresh token */
export async function exchangeCode(code: string, redirectUri: string): Promise<string | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  });
  if (!res.ok) {
    console.error('Google code exchange failed', res.status, await res.text());
    return null;
  }
  const json = await res.json();
  return json.refresh_token ?? null;
}

type GEvent = {
  status?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
};

/** Busy times from Google Calendar (events marked "Busy"), skipping events this app created. */
export async function googleBusy(fromMs: number, toMs: number): Promise<[number, number][]> {
  try {
    const q = new URLSearchParams({
      timeMin: new Date(fromMs).toISOString(),
      timeMax: new Date(toMs).toISOString(),
      singleEvents: 'true',
      maxResults: '500',
    });
    const res = await call(`/calendars/${calendarId()}/events?${q}`);
    if (!res || !res.ok) return [];
    const json = (await res.json()) as { items?: GEvent[] };
    const out: [number, number][] = [];
    for (const ev of json.items ?? []) {
      if (ev.status === 'cancelled' || ev.transparency === 'transparent') continue;
      if (ev.extendedProperties?.private?.tutoringBookingId) continue; // our own tutorings are already in the database
      if (ev.start?.dateTime && ev.end?.dateTime) {
        out.push([Date.parse(ev.start.dateTime), Date.parse(ev.end.dateTime)]);
      } else if (ev.start?.date && ev.end?.date) {
        out.push([localToUtc(ev.start.date, 0), localToUtc(ev.end.date, 0)]); // all-day event marked busy
      }
    }
    return out;
  } catch (e) {
    console.error('Google busy lookup failed', e);
    return [];
  }
}

function when(ms: number) {
  const l = utcToLocal(ms);
  const hh = String(Math.floor(l.minutes / 60)).padStart(2, '0');
  const mm = String(l.minutes % 60).padStart(2, '0');
  return { dateTime: `${l.date}T${hh}:${mm}:00`, timeZone: TIMEZONE };
}

/** Adds the tutoring to the calendar and emails an invite to the student. Returns the event id. */
export async function createTutoringEvent(b: {
  id: string;
  name: string;
  email: string;
  start: number;
  end: number;
}): Promise<string | null> {
  try {
    const res = await call(`/calendars/${calendarId()}/events?sendUpdates=all`, {
      method: 'POST',
      body: JSON.stringify({
        summary: `Tutoring · ${b.name}`,
        description: 'Booked with the tutorings app.',
        start: when(b.start),
        end: when(b.end),
        attendees: [{ email: b.email, displayName: b.name }],
        extendedProperties: { private: { tutoringBookingId: b.id } },
      }),
    });
    if (!res || !res.ok) return null;
    return (await res.json()).id ?? null;
  } catch (e) {
    console.error('Google create event failed', e);
    return null;
  }
}

export async function moveTutoringEvent(eventId: string, start: number, end: number) {
  try {
    await call(`/calendars/${calendarId()}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
      method: 'PATCH',
      body: JSON.stringify({ start: when(start), end: when(end) }),
    });
  } catch (e) {
    console.error('Google move event failed', e);
  }
}

export async function deleteTutoringEvent(eventId: string) {
  try {
    await call(`/calendars/${calendarId()}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
      method: 'DELETE',
    });
  } catch (e) {
    console.error('Google delete event failed', e);
  }
}
