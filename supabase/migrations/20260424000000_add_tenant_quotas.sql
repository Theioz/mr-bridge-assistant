-- Per-tenant daily rate limits (#457)
-- One row per Supabase user. Real chat tracks tokens + tool calls.
-- Demo account tracks turn count only (Groq is free -- this is an abuse guard).

create table tenant_quotas (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Real chat caps
  daily_chat_tokens     int not null default 100000,
  daily_tool_calls      int not null default 500,
  tokens_used_today     int not null default 0,
  tool_calls_used_today int not null default 0,

  -- Demo caps (meaningful only for the DEMO_USER_ID row)
  daily_demo_turns      int not null default 50,
  demo_turns_used_today int not null default 0,

  -- Admin-configurable per-tenant overrides (forward-compat with #462).
  -- NULL means "use the base cap". The check function COALESCEs them on read.
  daily_chat_tokens_override int,
  daily_tool_calls_override  int,

  last_reset date        not null default (now() at time zone 'utc')::date,
  updated_at timestamptz not null default now()
);

alter table tenant_quotas enable row level security;

-- Users can read their own row only (so the UI can show X of Y used).
-- All writes go through SECURITY DEFINER functions or the admin service role.
create policy "users read own tenant_quotas"
  on tenant_quotas for select to authenticated
  using (user_id = auth.uid());

-- Atomic check + increment. Called before streaming starts.
-- Returns jsonb: {allowed: bool, resets_at: timestamptz, reason?: text}.
-- p_kind: 'chat' for real users, 'demo' for the DEMO_USER_ID tenant.
create or replace function check_and_increment_quota(
  p_user_id uuid,
  p_kind    text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row       public.tenant_quotas;
  v_today     date := (now() at time zone 'utc')::date;
  v_resets_at timestamptz := ((v_today + 1)::timestamp at time zone 'utc');
  v_cap_tokens int;
  v_cap_calls  int;
begin
  -- Ensure row exists, then lock it for the duration of this transaction.
  insert into public.tenant_quotas (user_id)
    values (p_user_id)
    on conflict (user_id) do nothing;

  select * into v_row
    from public.tenant_quotas
    where user_id = p_user_id
    for update;

  -- Daily reset: zero counters when a new UTC day has started.
  if v_row.last_reset < v_today then
    update public.tenant_quotas
      set tokens_used_today     = 0,
          tool_calls_used_today = 0,
          demo_turns_used_today = 0,
          last_reset            = v_today,
          updated_at            = now()
      where user_id = p_user_id
      returning * into v_row;
  end if;

  if p_kind = 'demo' then
    if v_row.demo_turns_used_today >= v_row.daily_demo_turns then
      return jsonb_build_object(
        'allowed',    false,
        'reason',     'daily_quota_exhausted',
        'resets_at',  v_resets_at
      );
    end if;
    update public.tenant_quotas
      set demo_turns_used_today = demo_turns_used_today + 1,
          updated_at            = now()
      where user_id = p_user_id;
  else
    v_cap_tokens := coalesce(v_row.daily_chat_tokens_override, v_row.daily_chat_tokens);
    v_cap_calls  := coalesce(v_row.daily_tool_calls_override,  v_row.daily_tool_calls);
    if v_row.tokens_used_today     >= v_cap_tokens
    or v_row.tool_calls_used_today >= v_cap_calls then
      return jsonb_build_object(
        'allowed',    false,
        'reason',     'daily_quota_exhausted',
        'resets_at',  v_resets_at
      );
    end if;
    update public.tenant_quotas
      set tool_calls_used_today = tool_calls_used_today + 1,
          updated_at            = now()
      where user_id = p_user_id;
  end if;

  return jsonb_build_object('allowed', true, 'resets_at', v_resets_at);
end;
$$;

-- Post-stream token accounting (real chat path only; demo uses Groq, which is free).
-- Called from agent.onFinish with the billing-weighted token delta.
create or replace function record_quota_tokens(
  p_user_id uuid,
  p_tokens  int
) returns void
language sql
security definer
set search_path = ''
as $$
  update public.tenant_quotas
    set tokens_used_today = tokens_used_today + p_tokens,
        updated_at        = now()
    where user_id = p_user_id;
$$;
