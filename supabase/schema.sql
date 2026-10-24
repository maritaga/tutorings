-- Run this once in Supabase → SQL Editor → New query → Run.

create extension if not exists pgcrypto;

-- Tutorings booked by students
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text not null,          -- lowercase name without accents, used for lookups
  email text not null,
  pin_hash text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  google_event_id text,
  created_at timestamptz not null default now(),
  -- Two confirmed tutorings can never overlap, even if two people book at the same moment
  constraint bookings_no_overlap exclude using gist (
    tstzrange(start_at, end_at) with &&
  ) where (status = 'confirmed')
);
create index if not exists bookings_name_key_idx on bookings (name_key);
create index if not exists bookings_start_idx on bookings (start_at);

-- Change / cancel requests from students (wait for approval)
create table if not exists change_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id) on delete cascade,
  type text not null check (type in ('reschedule', 'cancel')),
  new_start timestamptz,
  new_end timestamptz,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'replaced')),
  created_at timestamptz not null default now()
);
create index if not exists change_requests_booking_idx on change_requests (booking_id);

-- One-off blocked times (appointments, trips, etc.)
create table if not exists blocks (
  id uuid primary key default gen_random_uuid(),
  start_at timestamptz not null,
  end_at timestamptz not null,
  label text not null default ''
);

-- Blocks that repeat every week (classes). weekday: 0 = Sunday … 6 = Saturday.
-- Times are minutes after midnight, Mexico City time.
create table if not exists weekly_blocks (
  id uuid primary key default gen_random_uuid(),
  weekday int not null check (weekday between 0 and 6),
  start_min int not null check (start_min between 0 and 1440),
  end_min int not null check (end_min between 0 and 1440),
  label text not null default ''
);

-- Settings (tutoring hours, Google connection)
create table if not exists settings (
  key text primary key,
  value jsonb not null
);

-- Wrong PIN attempts (to stop people guessing PINs)
create table if not exists pin_failures (
  id bigint generated always as identity primary key,
  name_key text not null,
  at timestamptz not null default now()
);
create index if not exists pin_failures_idx on pin_failures (name_key, at);

-- Only the app's server (secret key) can read or write. Nobody else.
alter table bookings enable row level security;
alter table change_requests enable row level security;
alter table blocks enable row level security;
alter table weekly_blocks enable row level security;
alter table settings enable row level security;
alter table pin_failures enable row level security;

-- ───── Starting data ─────

-- Tutoring hours: [Sun, Mon, Tue, Wed, Thu, Fri, Sat]
-- open = earliest start, lastStart = latest start (minutes after midnight)
insert into settings (key, value) values ('hours', '[
  {"open": 660, "lastStart": 1260},
  {"open": 420, "lastStart": 1260},
  {"open": 420, "lastStart": 1260},
  {"open": 420, "lastStart": 1260},
  {"open": 420, "lastStart": 1260},
  {"open": 420, "lastStart": 1260},
  {"open": 660, "lastStart": 1260}
]') on conflict (key) do nothing;

-- Weekly classes
insert into weekly_blocks (weekday, start_min, end_min, label)
select * from (values
  (1, 420, 540, 'Análisis de circuitos eléctricos'),
  (1, 660, 900, 'Diseño y análisis de experimentos'),
  (1, 900, 990, 'Argumentación, debate y el arte de la persuasión'),
  (4, 420, 540, 'Análisis de circuitos eléctricos'),
  (4, 660, 900, 'Diseño y análisis de experimentos'),
  (4, 900, 990, 'Argumentación, debate y el arte de la persuasión'),
  (2, 540, 660, 'Modelación en ingeniería mediante sistemas dinámicos'),
  (2, 780, 900, 'Diseño y análisis de experimentos'),
  (5, 540, 660, 'Modelación en ingeniería mediante sistemas dinámicos'),
  (5, 780, 900, 'Diseño y análisis de experimentos')
) as v(weekday, start_min, end_min, label)
where not exists (select 1 from weekly_blocks);
