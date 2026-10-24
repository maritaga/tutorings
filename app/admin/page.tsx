'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DAY_LONG,
  DAY_SHORT,
  fmtDuration,
  fmtRange,
  fmtTime,
  Hours,
  hhmmToMin,
  minToHhmm,
  todayLocal,
} from '@/lib/time';

type AdminBooking = { id: string; name: string; email: string; start: number; end: number; inCalendar: boolean };
type Data = {
  google: { configured: boolean; connected: boolean };
  requests: { id: string; type: 'reschedule' | 'cancel'; newStart: number | null; newEnd: number | null; booking: AdminBooking }[];
  bookings: AdminBooking[];
  blocks: { id: string; label: string; start: number; end: number }[];
  weekly: { id: string; weekday: number; start_min: number; end_min: number; label: string }[];
  hours: Hours;
};

async function api(body: unknown) {
  const res = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Something went wrong.');
  return json;
}

export default function AdminPage() {
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<'loading' | 'login' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [flash, setFlash] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin', { cache: 'no-store' });
    if (res.status === 401) return setState('login');
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || 'Could not load.');
      return setState('error');
    }
    setData(json);
    setState('ready');
  }, []);

  useEffect(() => {
    load();
    const g = new URLSearchParams(window.location.search).get('google');
    if (g === 'connected') setFlash({ kind: 'ok', text: 'Google Calendar connected.' });
    if (g === 'error') setFlash({ kind: 'error', text: "Google Calendar couldn't connect. Please try again." });
    if (g === 'missing') setFlash({ kind: 'error', text: 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel first.' });
    if (g) window.history.replaceState(null, '', '/admin');
  }, [load]);

  const run = async (body: unknown, success?: string) => {
    try {
      await api(body);
      if (success) setFlash({ kind: 'ok', text: success });
      await load();
      return true;
    } catch (e) {
      setFlash({ kind: 'error', text: (e as Error).message });
      return false;
    }
  };

  if (state === 'loading') return <main className="page"><div className="spinner">Loading…</div></main>;
  if (state === 'login') return <Login onDone={load} />;
  if (state === 'error' || !data)
    return (
      <main className="page">
        <div className="msg error">{error}</div>
        <p className="hint">Check the Supabase settings in Vercel and that you ran supabase/schema.sql.</p>
      </main>
    );

  return (
    <main className="page wide">
      <div className="admin-top">
        <header className="brand">
          <h1>tutorings</h1>
          <p>ADMIN</p>
        </header>
        <button
          className="link"
          onClick={async () => {
            await fetch('/api/admin/logout', { method: 'POST' });
            setState('login');
          }}
        >
          Log out
        </button>
      </div>

      {flash && (
        <div className={`msg ${flash.kind}`} style={{ marginBottom: 24 }} onClick={() => setFlash(null)}>
          {flash.text}
        </div>
      )}

      <GoogleSection google={data.google} run={run} />
      <RequestsSection data={data} run={run} />
      <BookingsSection data={data} run={run} />
      <BlocksSection data={data} run={run} />
      <WeeklySection data={data} run={run} />
      <HoursSection hours={data.hours} run={run} />
    </main>
  );
}

type Run = (body: unknown, success?: string) => Promise<boolean>;

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main className="page">
      <header className="brand">
        <h1>tutorings</h1>
        <p>ADMIN</p>
      </header>
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password }),
          });
          setBusy(false);
          if (res.ok) onDone();
          else setError((await res.json().catch(() => ({}))).error || 'Could not log in.');
        }}
      >
        <label className="field" style={{ marginTop: 0 }}>
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
        </label>
        {error && <div className="msg error">{error}</div>}
        <button className="btn" disabled={busy}>
          {busy ? 'Checking…' : 'Log in'}
        </button>
      </form>
    </main>
  );
}

function GoogleSection({ google, run }: { google: Data['google']; run: Run }) {
  return (
    <section>
      <h2 className="title">Google Calendar</h2>
      <div className="card">
        {!google.configured ? (
          <p className="empty">Not set up yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel (see the README).</p>
        ) : google.connected ? (
          <div className="trow">
            <span>
              <span className="badge green">Connected</span>
              <span className="hint" style={{ marginLeft: 10 }}>Busy events block times. Tutorings are added with an invite.</span>
            </span>
            <button className="link danger" onClick={() => confirm('Disconnect Google Calendar?') && run({ action: 'disconnectGoogle' }, 'Disconnected.')}>
              Disconnect
            </button>
          </div>
        ) : (
          <>
            <p className="empty" style={{ marginTop: 0 }}>Connect your calendar so your busy events block times and tutorings get added automatically.</p>
            <a className="btn" href="/api/google/connect" style={{ textDecoration: 'none' }}>
              Connect Google Calendar
            </a>
          </>
        )}
      </div>
    </section>
  );
}

function RequestsSection({ data, run }: { data: Data; run: Run }) {
  return (
    <section>
      <h2 className="title">Change requests {data.requests.length > 0 && <span className="badge pink">{data.requests.length}</span>}</h2>
      <div className="card">
        {data.requests.length === 0 ? (
          <p className="empty">No requests right now.</p>
        ) : (
          <div className="list">
            {data.requests.map((r) => (
              <div className="item" key={r.id}>
                <div className="item-head">
                  <div>
                    <div className="item-title">{r.booking.name}</div>
                    <div className="item-sub">{r.booking.email}</div>
                  </div>
                  <span className={`badge ${r.type === 'cancel' ? '' : 'pink'}`}>{r.type === 'cancel' ? 'Cancel' : 'Change'}</span>
                </div>
                <div className="note">
                  Now: {fmtRange(r.booking.start, r.booking.end)}
                  {r.type === 'reschedule' && (
                    <>
                      <br />
                      <b style={{ fontWeight: 500 }}>Wants:</b> {fmtRange(r.newStart!, r.newEnd!)} ({fmtDuration((r.newEnd! - r.newStart!) / 60_000)})
                    </>
                  )}
                </div>
                <div className="actions">
                  <button className="btn small" onClick={() => run({ action: 'approve', id: r.id }, 'Request approved.')}>
                    Approve
                  </button>
                  <button className="btn small ghost" onClick={() => run({ action: 'reject', id: r.id }, 'Request rejected.')}>
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function BookingsSection({ data, run }: { data: Data; run: Run }) {
  return (
    <section>
      <h2 className="title">Upcoming tutorings</h2>
      <div className="card">
        {data.bookings.length === 0 ? (
          <p className="empty">No upcoming tutorings.</p>
        ) : (
          <div className="table">
            {data.bookings.map((b) => (
              <div className="trow" key={b.id}>
                <div>
                  <div className="item-title">{fmtRange(b.start, b.end)}</div>
                  <div className="item-sub">
                    {b.name} · {b.email}
                  </div>
                </div>
                <button
                  className="link danger"
                  onClick={() => confirm(`Cancel ${b.name}'s tutoring?`) && run({ action: 'cancelBooking', id: b.id }, 'Tutoring cancelled.')}
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function BlocksSection({ data, run }: { data: Data; run: Run }) {
  const [date, setDate] = useState(todayLocal());
  const [from, setFrom] = useState('09:00');
  const [to, setTo] = useState('11:00');
  const [label, setLabel] = useState('');

  return (
    <section>
      <h2 className="title">Blocked times</h2>
      <div className="card">
        {data.blocks.length === 0 ? (
          <p className="empty">Nothing blocked. Add one-off commitments here.</p>
        ) : (
          <div className="table">
            {data.blocks.map((b) => (
              <div className="trow" key={b.id}>
                <div>
                  <div className="item-title">{fmtRange(b.start, b.end)}</div>
                  {b.label && <div className="item-sub">{b.label}</div>}
                </div>
                <button className="link danger" onClick={() => run({ action: 'deleteBlock', id: b.id }, 'Unblocked.')}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <form
          className="sub form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run({ action: 'addBlock', date, from: hhmmToMin(from), to: hhmmToMin(to), label }, 'Time blocked.');
            if (ok) setLabel('');
          }}
        >
          <label className="field full">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="field">
            <span>From</span>
            <input type="time" step={1800} value={from} onChange={(e) => setFrom(e.target.value)} required />
          </label>
          <label className="field">
            <span>To</span>
            <input type="time" step={1800} value={to} onChange={(e) => setTo(e.target.value)} required />
          </label>
          <label className="field full">
            <span>Note (optional)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Doctor, trip, exam…" />
          </label>
          <button className="btn full">Block time</button>
        </form>
      </div>
    </section>
  );
}

function WeeklySection({ data, run }: { data: Data; run: Run }) {
  const [weekday, setWeekday] = useState(1);
  const [from, setFrom] = useState('07:00');
  const [to, setTo] = useState('09:00');
  const [label, setLabel] = useState('');

  return (
    <section>
      <h2 className="title">Weekly classes</h2>
      <div className="card">
        {data.weekly.length === 0 ? (
          <p className="empty">No weekly blocks.</p>
        ) : (
          <div className="table">
            {data.weekly.map((w) => (
              <div className="trow" key={w.id}>
                <div>
                  <div className="item-title">
                    {DAY_SHORT[w.weekday]} · {fmtTime(w.start_min)} – {fmtTime(w.end_min)}
                  </div>
                  {w.label && <div className="item-sub">{w.label}</div>}
                </div>
                <button className="link danger" onClick={() => run({ action: 'deleteWeekly', id: w.id }, 'Removed.')}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <form
          className="sub form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run({ action: 'addWeekly', weekday, from: hhmmToMin(from), to: hhmmToMin(to), label }, 'Weekly block added.');
            if (ok) setLabel('');
          }}
        >
          <label className="field full">
            <span>Day</span>
            <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
              {DAY_LONG.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>From</span>
            <input type="time" step={1800} value={from} onChange={(e) => setFrom(e.target.value)} required />
          </label>
          <label className="field">
            <span>To</span>
            <input type="time" step={1800} value={to} onChange={(e) => setTo(e.target.value)} required />
          </label>
          <label className="field full">
            <span>Class (optional)</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Class name" />
          </label>
          <button className="btn full">Add weekly block</button>
        </form>
      </div>
    </section>
  );
}

function HoursSection({ hours, run }: { hours: Hours; run: Run }) {
  const [draft, setDraft] = useState<Hours>(hours);
  useEffect(() => setDraft(hours), [hours]);

  const update = (i: number, value: Hours[number]) => setDraft(draft.map((h, j) => (j === i ? value : h)));

  return (
    <section>
      <h2 className="title">Tutoring hours</h2>
      <div className="card">
        <p className="hint" style={{ marginTop: 0 }}>Earliest and latest time a tutoring can start each day.</p>
        <div className="hours-row" style={{ color: 'var(--muted)', fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' }}>
          <span>Day</span>
          <span>First start</span>
          <span>Last start</span>
        </div>
        {draft.map((h, i) => (
          <div className="hours-row" key={i}>
            <label>
              <input type="checkbox" checked={h !== null} onChange={(e) => update(i, e.target.checked ? { open: 420, lastStart: 1260 } : null)} />
              {DAY_SHORT[i]}
            </label>
            {h ? (
              <>
                <input type="time" step={1800} value={minToHhmm(h.open)} onChange={(e) => update(i, { ...h, open: hhmmToMin(e.target.value) })} />
                <input type="time" step={1800} value={minToHhmm(h.lastStart)} onChange={(e) => update(i, { ...h, lastStart: hhmmToMin(e.target.value) })} />
              </>
            ) : (
              <span className="empty" style={{ gridColumn: 'span 2' }}>Closed</span>
            )}
          </div>
        ))}
        <button className="btn" onClick={() => run({ action: 'saveHours', hours: draft }, 'Hours saved.')}>
          Save hours
        </button>
      </div>
    </section>
  );
}
