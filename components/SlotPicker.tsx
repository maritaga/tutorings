'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addDays,
  DAY_LONG,
  DAY_SHORT,
  DURATIONS,
  fmtDuration,
  fmtMonthDay,
  fmtRange,
  fmtTime,
  Hours,
  localToUtc,
  overlaps,
  STEP_MIN,
  todayLocal,
  utcToLocal,
  weekdayOf,
  weekStartOf,
} from '@/lib/time';

type Availability = {
  week: string;
  today: string;
  now: number;
  maxDate: string;
  hours: Hours;
  busy: [number, number][];
};

export type Selection = { start: number; duration: number } | null;

type Props = {
  value: Selection;
  onChange: (s: Selection) => void;
  initialDuration?: number;
  excludeBookingId?: string; // when moving an existing tutoring
  current?: { start: number; end: number }; // shown with a dashed outline
  refreshKey?: number;
};

const ROW = 22; // height in px of 30 minutes

export default function SlotPicker({ value, onChange, initialDuration = 60, excludeBookingId, current, refreshKey = 0 }: Props) {
  const [week, setWeek] = useState(() => weekStartOf(todayLocal()));
  const [duration, setDuration] = useState(initialDuration);
  const [data, setData] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const autoJumped = useRef(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    const q = new URLSearchParams({ week });
    if (excludeBookingId) q.set('exclude', excludeBookingId);
    fetch(`/api/availability?${q}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || 'Could not load the calendar.');
        return json as Availability;
      })
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [week, excludeBookingId, refreshKey]);

  const ready = data && data.week === week ? data : null;
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);

  // Rows shown: from the earliest opening to the latest start + the chosen length
  const [gridStart, gridEnd] = useMemo(() => {
    const open = (ready?.hours ?? []).filter(Boolean) as { open: number; lastStart: number }[];
    if (open.length === 0) return [420, 1290];
    return [Math.min(...open.map((h) => h.open)), Math.max(...open.map((h) => h.lastStart)) + duration];
  }, [ready, duration]);
  const rows = useMemo(() => {
    const r: number[] = [];
    for (let m = gridStart; m < gridEnd; m += STEP_MIN) r.push(m);
    return r;
  }, [gridStart, gridEnd]);

  const isBusy = (s: number, e: number) => !!ready && ready.busy.some(([bs, be]) => overlaps(s, e, bs, be));

  /** Why a tutoring can't start at `m` on `date` for `dur` minutes (null = it can) */
  const problem = (date: string, m: number, dur: number): string | null => {
    if (!ready) return 'Loading…';
    const h = ready.hours[weekdayOf(date)];
    const start = localToUtc(date, m);
    if (start <= Date.now()) return 'That time has already passed.';
    if (!h) return `There are no tutorings on ${DAY_LONG[weekdayOf(date)]}s.`;
    if (date > ready.maxDate) return 'That date is too far ahead.';
    if (m < h.open || m > h.lastStart) {
      return `On ${DAY_LONG[weekdayOf(date)]}s tutorings can start between ${fmtTime(h.open)} and ${fmtTime(h.lastStart)}.`;
    }
    if (isBusy(start, start + dur * 60_000)) return 'busy';
    return null;
  };

  /** Grey cell = nobody can be there */
  const cellGrey = (date: string, m: number) => {
    if (!ready) return true;
    const h = ready.hours[weekdayOf(date)];
    const s = localToUtc(date, m);
    if (s < Date.now() || !h || date > ready.maxDate || m < h.open) return true;
    return isBusy(s, s + STEP_MIN * 60_000);
  };

  const hasFreeFrom = (dates: string[]) =>
    dates.some((d) => {
      const h = ready?.hours[weekdayOf(d)];
      if (!h) return false;
      for (let m = h.open; m <= h.lastStart; m += STEP_MIN) if (!problem(d, m, DURATIONS[0])) return true;
      return false;
    });

  // If nothing is left this week (e.g. Saturday night), open next week instead
  useEffect(() => {
    if (!ready || autoJumped.current) return;
    autoJumped.current = true;
    if (week === weekStartOf(ready.today) && !hasFreeFrom(days) && addDays(week, 7) <= ready.maxDate) {
      setWeek(addDays(week, 7));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // If the chosen time stops fitting (e.g. a longer length), clear it
  useEffect(() => {
    if (!value || !ready) return;
    const l = utcToLocal(value.start);
    if (!days.includes(l.date)) return;
    if (problem(l.date, l.minutes, duration)) onChange(null);
    else if (value.duration !== duration) onChange({ start: value.start, duration });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, ready]);

  const pick = (date: string, m: number) => {
    const p = problem(date, m, duration);
    if (!p) {
      setNotice('');
      onChange({ start: localToUtc(date, m), duration });
      return;
    }
    if (p !== 'busy') return setNotice(p);
    const start = localToUtc(date, m);
    if (isBusy(start, start + STEP_MIN * 60_000)) {
      return setNotice("That time isn't available. Grey times are classes, other tutorings or blocked times.");
    }
    const fits = [...DURATIONS].reverse().find((d) => d < duration && !problem(date, m, d));
    setNotice(
      fits
        ? `Only ${fmtDuration(fits)} fits starting at ${fmtTime(m)}. Choose a shorter length or another time.`
        : `There isn't ${fmtDuration(duration)} free starting at ${fmtTime(m)}.`,
    );
  };

  const today = ready?.today ?? todayLocal();
  const firstWeek = weekStartOf(today);
  const canNext = ready ? addDays(week, 7) <= ready.maxDate : false;

  const block = (start: number, end: number) => {
    const l = utcToLocal(start);
    const col = days.indexOf(l.date);
    if (col < 0) return null;
    return { col, top: ((l.minutes - gridStart) / STEP_MIN) * ROW, height: ((end - start) / 60_000 / STEP_MIN) * ROW, minutes: l.minutes };
  };
  const sel = value ? block(value.start, value.start + value.duration * 60_000) : null;
  const cur = current ? block(current.start, current.end) : null;

  return (
    <div>
      <div className="label">Length</div>
      <div className="chips">
        {DURATIONS.map((d) => (
          <button key={d} className={`chip ${d === duration ? 'on' : ''}`} onClick={() => setDuration(d)}>
            {fmtDuration(d)}
          </button>
        ))}
      </div>

      <div className="weeknav" style={{ marginTop: 18 }}>
        <button className="arrow" aria-label="Previous week" disabled={week <= firstWeek} onClick={() => setWeek(addDays(week, -7))}>
          ‹
        </button>
        <span>
          {fmtMonthDay(week)} – {fmtMonthDay(addDays(week, 6))}
        </span>
        <button className="arrow" aria-label="Next week" disabled={!canNext} onClick={() => setWeek(addDays(week, 7))}>
          ›
        </button>
      </div>

      {error ? (
        <div className="msg error">{error}</div>
      ) : (
        <div className={`cal ${loading ? 'loading' : ''}`}>
          <div className="cal-head">
            <div />
            {days.map((d) => (
              <div key={d} className={`cal-day ${d === today ? 'today' : ''} ${d < today ? 'past' : ''}`}>
                <small>{DAY_SHORT[weekdayOf(d)]}</small>
                <b>{Number(d.slice(8))}</b>
              </div>
            ))}
          </div>
          <div className="cal-body">
            <div className="cal-times">
              {rows.map((m) => (
                <div key={m} style={{ height: ROW }}>
                  {m % 60 === 0 ? fmtTime(m).replace(':00', '') : ''}
                </div>
              ))}
            </div>
            {days.map((d, i) => (
              <div key={d} className="cal-col">
                {rows.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`cal-cell ${cellGrey(d, m) ? 'grey' : ''} ${m % 60 === 0 ? 'hour' : ''}`}
                    style={{ height: ROW }}
                    aria-label={`${DAY_LONG[weekdayOf(d)]} ${fmtTime(m)}`}
                    onClick={() => pick(d, m)}
                  />
                ))}
                {cur && cur.col === i && <div className="cal-current" style={{ top: cur.top, height: cur.height }} />}
                {sel && sel.col === i && (
                  <div className="cal-sel" style={{ top: sel.top, height: sel.height }}>
                    {fmtTime(sel.minutes).replace(' ', ' ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="cal-legend">
        <span><i className="sw grey" /> Not available</span>
        {current && <span><i className="sw current" /> Current time</span>}
        <span><i className="sw pink" /> Your choice</span>
      </div>
      <p className="hint">Tap where you want your tutoring to start.</p>

      {notice && <div className="msg info">{notice}</div>}
      {value && <div className="summary">{fmtRange(value.start, value.start + value.duration * 60_000, true)}</div>}
    </div>
  );
}
