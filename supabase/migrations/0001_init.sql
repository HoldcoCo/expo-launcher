-- Expo launcher schema. RLS is on with no policies: only the service role key can read or write.

create table login_attempts (
  ip text primary key,
  failed_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz
);
alter table login_attempts enable row level security;
