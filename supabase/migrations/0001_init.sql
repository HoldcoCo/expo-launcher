-- Expo launcher schema. RLS is on with no policies: only the service role key can read or write.

create table login_attempts (
  ip text primary key,
  failed_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz
);
alter table login_attempts enable row level security;

create table apps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  group_name text not null,
  description text,
  url text not null check (url like 'https://%'),
  requires_login boolean not null default true,
  username text,
  password_encrypted text,
  redirect_delay_ms integer not null default 1500 check (redirect_delay_ms between 500 and 10000),
  sort_order integer not null default 100,
  is_active boolean not null default true,
  last_check_ok boolean,
  last_check_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table apps enable row level security;

create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger apps_touch before update on apps for each row execute function touch_updated_at();
