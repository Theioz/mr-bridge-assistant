-- Media backlog tracker (#582)
-- Tables: backlog_items (games/shows/movies/books) + backlog_sessions (re-play/re-watch/re-read logs)

create type media_type as enum ('game', 'show', 'movie', 'book');
create type backlog_status as enum ('backlog', 'active', 'paused', 'finished', 'dropped');

create table backlog_items (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  media_type      media_type not null,
  title           text not null,
  creator         text,                   -- director / author / developer / showrunner
  release_date    date,
  description     text,
  cover_url       text,
  external_id     text,                   -- e.g. "12345" (TMDB id), "OL12345W" (OpenLibrary)
  external_source text,                   -- 'tmdb', 'igdb', 'openlibrary', 'manual'
  metadata        jsonb,                  -- type-specific extras: platform, runtime, page_count, episode_count, etc.
  status          backlog_status not null default 'backlog',
  priority        int not null default 0, -- stack rank within (user_id, media_type); lower = higher
  rating          numeric(3,1) check (rating >= 0 and rating <= 10),
  review          text,
  share_token     uuid unique,            -- null = private; non-null = public read via /share/backlog/[token]
  started_at      timestamptz,            -- first session start (lifecycle)
  finished_at     timestamptz,            -- most recent finish
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index backlog_items_user_type_priority_idx
  on backlog_items (user_id, media_type, priority);

create index backlog_items_user_status_idx
  on backlog_items (user_id, status);

create index backlog_items_share_token_idx
  on backlog_items (share_token) where share_token is not null;

alter table backlog_items enable row level security;

create policy "users manage own backlog items"
  on backlog_items for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Reuse the set_updated_at() trigger function created in migration 20260426000000.
create trigger trg_backlog_items_updated_at
  before update on backlog_items
  for each row execute function set_updated_at();

-- Session log: one row per re-play / re-watch / re-read
create table backlog_sessions (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references backlog_items(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  started_at  timestamptz,
  finished_at timestamptz,
  notes       text,
  created_at  timestamptz not null default now()
);

create index backlog_sessions_item_idx on backlog_sessions (item_id);
create index backlog_sessions_user_idx on backlog_sessions (user_id);

alter table backlog_sessions enable row level security;

create policy "users manage own backlog sessions"
  on backlog_sessions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
