-- Per-user OAuth integration tokens (#390)
-- Stores encrypted refresh tokens for Google (calendar, gmail, fit) per Supabase user.
-- One row per user per provider; 'google' covers all Google scopes.

create extension if not exists pgcrypto;

-- SQL-level helpers so call sites don't embed the key inline
create or replace function encrypt_integration_token(token text, key text)
  returns bytea
  language sql
  security definer
  set search_path = ''
as $$
  select extensions.pgp_sym_encrypt(token, key)
$$;

create or replace function decrypt_integration_token(encrypted bytea, key text)
  returns text
  language sql
  security definer
  set search_path = ''
as $$
  select extensions.pgp_sym_decrypt(encrypted, key)
$$;

create table user_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  refresh_token_encrypted bytea not null,
  access_token text,
  access_token_expires_at timestamptz,
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

alter table user_integrations enable row level security;

create policy "users manage own user_integrations"
  on user_integrations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
