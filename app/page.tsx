'use client';

import { useState } from 'react';
import SlotPicker, { Selection } from '@/components/SlotPicker';
import { fmtDuration, fmtRange } from '@/lib/time';

type Booking = {
  id: string;
  name: string;
  start: number;
  end: number;
  status: 'confirmed' | 'cancelled';
  request: {
    type: 'reschedule' | 'cancel';
    status: 'pending' | 'approved' | 'rejected';
    newStart: number | null;
    newEnd: number | null;
  } | null;
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Something went wrong. Please try again.');
  return json as T;
}

const onlyDigits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

export default function Home() {
  return (
    <main className="page">
      <header className="brand">
        <h1>tutorings</h1>
        <p>WITH MARITA</p>
      </header>
      <ScheduleSection />
      <CheckSection />
    </main>
  );
}

/* ───────────────────────── Schedule ───────────────────────── */

function ScheduleSection() {
  const [slot, setSlot] = useState<Selection>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<Booking | null>(null);
  const [refresh, setRefresh] = useState(0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slot) return setError('Please choose a day and a start time.');
    setBusy(true);
    setError('');
    try {
      const { booking } = await post<{ booking: Booking }>('/api/bookings', { name, email, pin, ...slot });
      setDone(booking);
      setSlot(null);
      setRefresh((r) => r + 1);
    } catch (err) {
      setError((err as Error).message);
      setRefresh((r) => r + 1); // the time may have just been taken
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <section>
        <h2 className="title">Schedule:</h2>
        <div className="card">
          <div className="msg ok" style={{ marginTop: 0 }}>
            You're booked, {done.name}!
          </div>
          <div className="summary">{fmtRange(done.start, done.end, true)}</div>
          <p className="hint">
            A calendar invite is on its way to your email. To check or change this tutoring, use your name and PIN below.
          </p>
          <button className="btn ghost" onClick={() => setDone(null)}>
            Book another tutoring
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="title">Schedule:</h2>
      <div className="card">
        <SlotPicker value={slot} onChange={setSlot} refreshKey={refresh} />

        {slot && (
          <form onSubmit={submit} className="sub">
            <label className="field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" autoComplete="name" required />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                autoComplete="email"
                required
              />
            </label>
            <label className="field">
              <span>Choose a 4-digit PIN</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(onlyDigits(e.target.value))}
                placeholder="••••"
                required
                minLength={4}
                maxLength={4}
              />
            </label>
            <p className="hint">You'll use your name and PIN to check or change your tutorings.</p>
            {error && <div className="msg error">{error}</div>}
            <button className="btn" disabled={busy}>
              {busy ? 'Booking…' : 'Book tutoring'}
            </button>
          </form>
        )}
        {!slot && error && <div className="msg error">{error}</div>}
      </div>
    </section>
  );
}

/* ───────────────────────── Check my tutorings ───────────────────────── */

function CheckSection() {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [who, setWho] = useState<{ name: string; pin: string } | null>(null);

  const load = async (cred: { name: string; pin: string }) => {
    const { bookings } = await post<{ bookings: Booking[] }>('/api/my', cred);
    setBookings(bookings);
    setWho(cred);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await load({ name, pin });
    } catch (err) {
      setError((err as Error).message);
      setBookings(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2 className="title">Check my tutorings</h2>
      <div className="card">
        {!who ? (
          <form onSubmit={submit}>
            <label className="field" style={{ marginTop: 0 }}>
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" required />
            </label>
            <label className="field">
              <span>PIN</span>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(onlyDigits(e.target.value))}
                placeholder="••••"
                required
                minLength={4}
                maxLength={4}
              />
            </label>
            {error && <div className="msg error">{error}</div>}
            <button className="btn" disabled={busy}>
              {busy ? 'Checking…' : 'Check'}
            </button>
          </form>
        ) : (
          <>
            <div className="item-head" style={{ marginBottom: 14 }}>
              <div className="item-title">Hi, {bookings?.[0]?.name ?? who.name}</div>
              <button
                className="link"
                onClick={() => {
                  setWho(null);
                  setBookings(null);
                  setPin('');
                }}
              >
                Sign out
              </button>
            </div>
            {bookings && bookings.length === 0 && <p className="empty">You have no upcoming tutorings.</p>}
            <div className="list">
              {bookings?.map((b) => (
                <BookingItem key={b.id} booking={b} who={who} onChanged={() => load(who)} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function BookingItem({
  booking: b,
  who,
  onChanged,
}: {
  booking: Booking;
  who: { name: string; pin: string };
  onChanged: () => Promise<void>;
}) {
  const [mode, setMode] = useState<'none' | 'change' | 'cancel'>('none');
  const [slot, setSlot] = useState<Selection>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  const [refresh, setRefresh] = useState(0);

  const duration = (b.end - b.start) / 60_000;
  const pending = b.request?.status === 'pending' ? b.request : null;
  const rejected = b.request?.status === 'rejected' ? b.request : null;
  const canRequest = b.status === 'confirmed' && b.start > Date.now();

  const send = async (type: 'reschedule' | 'cancel') => {
    if (type === 'reschedule' && !slot) return setError('Please choose a new day and time.');
    setBusy(true);
    setError('');
    try {
      await post('/api/requests', { ...who, bookingId: b.id, type, ...(type === 'reschedule' ? slot : {}) });
      setSent(type === 'cancel' ? 'Cancellation requested.' : 'Change requested.');
      setMode('none');
      setSlot(null);
      await onChanged();
    } catch (err) {
      setError((err as Error).message);
      setRefresh((r) => r + 1);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="item">
      <div className="item-head">
        <div>
          <div className="item-title">{fmtRange(b.start, b.end)}</div>
          <div className="item-sub">{fmtDuration(duration)}</div>
        </div>
        {b.status === 'cancelled' ? (
          <span className="badge">Cancelled</span>
        ) : pending ? (
          <span className="badge pink">Request pending</span>
        ) : (
          <span className="badge green">Confirmed</span>
        )}
      </div>

      {pending && (
        <div className="note pink">
          {pending.type === 'cancel'
            ? 'You asked to cancel this tutoring.'
            : `You asked to move it to ${fmtRange(pending.newStart!, pending.newEnd!)}.`}{' '}
          Waiting for Marita's approval.
        </div>
      )}
      {rejected && !pending && b.status === 'confirmed' && (
        <div className="note">Your last request wasn't approved, so this tutoring stays as it is.</div>
      )}
      {sent && !error && <div className="msg ok">{sent} Marita will review it soon.</div>}

      {canRequest && mode === 'none' && (
        <div className="actions">
          <button className="link" onClick={() => { setMode('change'); setSent(''); setError(''); }}>
            {pending ? 'Request a different change' : 'Request change'}
          </button>
          <button className="link danger" onClick={() => { setMode('cancel'); setSent(''); setError(''); }}>
            Request cancellation
          </button>
        </div>
      )}

      {mode === 'change' && (
        <div className="sub">
          <p className="hint" style={{ marginTop: 0, marginBottom: 14 }}>
            Pick a new day, time or length. The dashed box is your current time.
          </p>
          <SlotPicker
            value={slot}
            onChange={setSlot}
            initialDuration={duration}
            excludeBookingId={b.id}
            current={{ start: b.start, end: b.end }}
            refreshKey={refresh}
          />
          {error && <div className="msg error">{error}</div>}
          <button className="btn" disabled={busy || !slot} onClick={() => send('reschedule')}>
            {busy ? 'Sending…' : 'Send change request'}
          </button>
          <button className="btn ghost" onClick={() => { setMode('none'); setSlot(null); setError(''); }}>
            Never mind
          </button>
        </div>
      )}

      {mode === 'cancel' && (
        <div className="sub">
          <p className="hint" style={{ marginTop: 0 }}>Ask Marita to cancel this tutoring?</p>
          {error && <div className="msg error">{error}</div>}
          <div className="row">
            <button className="btn ghost" onClick={() => { setMode('none'); setError(''); }}>
              Keep it
            </button>
            <button className="btn" disabled={busy} onClick={() => send('cancel')}>
              {busy ? 'Sending…' : 'Yes, request'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
