export interface AdminTenant {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  tokens_used_today: number;
  token_cap: number;
  tool_calls_used_today: number;
  tool_calls_cap: number;
  integration_count: number;
}

export interface AdminAuditLogRow {
  id: string;
  admin_user_id: string;
  target_user_id: string | null;
  action: string;
  before_value: unknown;
  after_value: unknown;
  created_at: string;
}

export interface FeatureFlagRow {
  id: string;
  user_id: string | null;
  flag_name: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantQuotaRow {
  daily_chat_tokens: number;
  daily_tool_calls: number;
  tokens_used_today: number;
  tool_calls_used_today: number;
  daily_chat_tokens_override: number | null;
  daily_tool_calls_override: number | null;
  daily_demo_turns: number;
  demo_turns_used_today: number;
  last_reset: string;
}

export interface TenantIntegration {
  provider: string;
  connected_at: string;
  scopes: string[];
}

export interface TenantChatSession {
  id: string;
  started_at: string;
  last_active_at: string;
  summary: string | null;
}

export interface TenantProfileEntry {
  key: string;
  value: string | null;
}

export interface TenantDetail {
  user: { id: string; email: string; created_at: string; last_sign_in_at: string | null };
  profile: TenantProfileEntry[];
  integrations: TenantIntegration[];
  sessions: TenantChatSession[];
  quota: TenantQuotaRow | null;
  flags: FeatureFlagRow[];
  auditLog: AdminAuditLogRow[];
}
