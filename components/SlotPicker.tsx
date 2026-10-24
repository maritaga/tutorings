'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  addDays,
  DAY_SHORT,
  DURATIONS,
  fmtDate,
  fmtDuration,
  fmtMonthDay,
  fmtRange,
  fmtTime,
  Hours,
  localToUtc,
  overlaps,
  STEP_MIN,
  todayLocal,
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

type Slot = { minutes: number; start: number; free: boolean; past: boolean };

export type Selection = { start: number; duration: number } | null;

type Props = {
  value: Selection;
  onChange: (s: Selection) => void;
  initialDuration?: number;
  excludeBookingId?: string; // when moving an existing tutoring
  refreshKey?: number;
};

export default function SlotPicker({ value, onChange, initialDuration = 60, excludeBookingId, refreshKey = 0 }: Props) {
  const [week, setWeek] = useState(() => weekStartOf(todayLocal()));
  const [day, setDay] = useState<string | null>(null);
  const [duration, setDuration] = useState(initialDuration);
  const [data, setData] = useState<Availability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);

  const slotsFor = (date: string, dur: number): Slot[] => {
    if (!data || data.week !== week) return [];
    const h = data.hours[weekdayOf(date)];
    if (!h || date > data.maxDate) return [];
    const now = Date.now();
    const out: Slot[] = [];
    for (let m = h.open; m <= h.lastStart; m += STEP_MIN) {
      const start = localToUtc(date, m);
      const end = start + dur * 60_000;
      const past = start <= now;
      const free = !past && !data.busy.some(([s, e]) => overlaps(start, end, s, e));
      out.push({ minutes: m, start, free, past });
    }
    return out;
  };

  const hasFree = (date: string) => slotsFor(date, duration).some((s) => s.free);

  // Pick a sensible day when the week loads: keep the current one, otherwise the first day with free times
  useEffect(() => {
    if (!data || data.week !== week) return;
    if (day && days.includes(day) && day >= data.today) return;
    setDay(days.find((d) => d >= data.today && hasFree(d)) ?? days.find((d) => d >= data.today) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, week]);

  // If the chosen time stops fitting (e.g. longer duration), clear it
  useEffect(() => {
    if (!value || !day) return;
    const slot = slotsFor(day, duration).find((s) => s.start === value.start);
    if (!slot || !slot.free) onChange(null);
    else if (value.duration !== duration) onChange({ start: value.start, duration });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, data]);

  const today = data?.today ?? todayLocal();
  const firstWeek = weekStartOf(today);
  const canNext = data ? addDays(week, 7) <= data.maxDate : false;
  const slots = day ? slotsFor(day, duration) : [];
  const freeCount = slots.filter((s) => s.free).length;

  const pickSlot = (s: Slot) => {
    if (s.free) {
      setNotice('');
      onChange({ start: s.start, duration });
    } else {
      setNotice(
        s.past
          ? 'That time has already passed.'
          : `${fmtTime(s.minutes)} isn't available for ${fmtDuration(duration)}. It overlaps a class, another tutoring or a blocked time.`,
      );
    }
  };

  return (
    <div>
      <div className="weeknav">
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

      <div className="days">
        {days.map((d) => {
          const past = d < today;
          const full = !past && !loading && !hasFree(d);
          return (
            <button
              key={d}
              className={`day ${d === day ? 'on' : ''} ${full ? 'full' : ''}`}
              disabled={past}
              onClick={() => {
                setDay(d);
                setNotice('');
              }}
            >
              <small>{DAY_SHORT[weekdayOf(d)]}</small>
              <b>{Number(d.slice(8))}</b>
            </button>
          );
        })}
      </div>

      <div className="label">Length</div>
      <div className="chips">
        {DURATIONS.map((d) => (
          <button key={d} className={`chip ${d === duration ? 'on' : ''}`} onClick={() => setDuration(d)}>
            {fmtDuration(d)}
          </button>
        ))}
      </div>

      <div className="label">Start time{day ? ` · ${fmtDate(day)}` : ''}</div>
      {error ? (
        <div className="msg error">{error}</div>
      ) : loading ? (
        <div className="spinner">Loading…</div>
      ) : !day ? (
        <p className="hint">Choose a day.</p>
      ) : slots.length === 0 ? (
        <p className="hint">No tutorings on this day.</p>
      ) : (
        <>
          <div className="chips times">
            {slots.map((s) => (
              <button
                key={s.start}
                className={`chip ${!s.free ? 'off' : ''} ${value?.start === s.start ? 'on' : ''}`}
                aria-disabled={!s.free}
                onClick={() => pickSlot(s)}
              >
                {fmtTime(s.minutes)}
              </button>
            ))}
          </div>
          {freeCount === 0 && (
            <p className="hint">No free times for {fmtDuration(duration)} on this day. Try a shorter length or another day.</p>
          )}
        </>
      )}

      {notice && <div className="msg info">{notice}</div>}

      {value && <div className="summary">{fmtRange(value.start, value.start + value.duration * 60_000, true)}</div>}
    </div>
  );
}
