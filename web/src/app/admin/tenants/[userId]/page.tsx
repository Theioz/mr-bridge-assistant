export const dynamic = "force-dynamic";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  AdminAuditLogRow,
  FeatureFlagRow,
  TenantChatSession,
  TenantDetail,
  TenantIntegration,
  TenantProfileEntry,
  TenantQuotaRow,
} from "@/lib/admin-types";

// ─── server actions ────────────────────────────────────────────────────────

async function updateTokenOverride(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user: admin },
  } = await supabase.auth.getUser();
  if (!admin || admin.user_metadata?.is_admin !== true) return;

  const userId = formData.get("userId") as string;
  const raw = (formData.get("tokenOverride") as string).trim();
  const value = raw === "" ? null : parseInt(raw, 10);
  if (raw !== "" && (isNaN(value!) || value! < 0)) return;

  const svc = createServiceClient();
  const { data: before } = await svc
    .from("tenant_quotas")
    .select("daily_chat_tokens_override")
    .eq("user_id", userId)
    .maybeSingle();

  await svc
    .from("tenant_quotas")
    .upsert(
      { user_id: userId, daily_chat_tokens_override: value, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  await svc.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    target_user_id: userId,
    action: "update_token_override",
    before_value: before ? { daily_chat_tokens_override: before.daily_chat_tokens_override } : null,
    after_value: { daily_chat_tokens_override: value },
  });

  revalidatePath(`/admin/tenants/${userId}`);
}

async function updateToolCallOverride(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user: admin },
  } = await supabase.auth.getUser();
  if (!admin || admin.user_metadata?.is_admin !== true) return;

  const userId = formData.get("userId") as string;
  const raw = (formData.get("toolCallOverride") as string).trim();
  const value = raw === "" ? null : parseInt(raw, 10);
  if (raw !== "" && (isNaN(value!) || value! < 0)) return;

  const svc = createServiceClient();
  const { data: before } = await svc
    .from("tenant_quotas")
    .select("daily_tool_calls_override")
    .eq("user_id", userId)
    .maybeSingle();

  await svc
    .from("tenant_quotas")
    .upsert(
      { user_id: userId, daily_tool_calls_override: value, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  await svc.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    target_user_id: userId,
    action: "update_tool_call_override",
    before_value: before ? { daily_tool_calls_override: before.daily_tool_calls_override } : null,
    after_value: { daily_tool_calls_override: value },
  });

  revalidatePath(`/admin/tenants/${userId}`);
}

async function resetQuotaToday(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user: admin },
  } = await supabase.auth.getUser();
  if (!admin || admin.user_metadata?.is_admin !== true) return;

  const userId = formData.get("userId") as string;
  const svc = createServiceClient();

  const { data: before } = await svc
    .from("tenant_quotas")
    .select("tokens_used_today, tool_calls_used_today")
    .eq("user_id", userId)
    .maybeSingle();

  await svc.from("tenant_quotas").upsert(
    {
      user_id: userId,
      tokens_used_today: 0,
      tool_calls_used_today: 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  await svc.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    target_user_id: userId,
    action: "reset_quota_today",
    before_value: before ?? null,
    after_value: { tokens_used_today: 0, tool_calls_used_today: 0 },
  });

  revalidatePath(`/admin/tenants/${userId}`);
}

async function setFeatureFlag(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user: admin },
  } = await supabase.auth.getUser();
  if (!admin || admin.user_metadata?.is_admin !== true) return;

  const userId = (formData.get("userId") as string) || null;
  const flagName = formData.get("flagName") as string;
  const enabled = formData.get("newEnabled") === "true";

  const svc = createServiceClient();
  await svc.from("feature_flags").upsert(
    {
      user_id: userId,
      flag_name: flagName,
      enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,flag_name" },
  );

  await svc.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    target_user_id: userId,
    action: "set_feature_flag",
    before_value: null,
    after_value: { flag_name: flagName, enabled, user_id: userId },
  });

  const path = userId ? `/admin/tenants/${userId}` : "/admin";
  revalidatePath(path);
}

async function deleteFeatureFlag(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user: admin },
  } = await supabase.auth.getUser();
  if (!admin || admin.user_metadata?.is_admin !== true) return;

  const flagId = formData.get("flagId") as string;
  const userId = formData.get("userId") as string;

  const svc = createServiceClient();
  const { data: before } = await svc
    .from("feature_flags")
    .select("flag_name, enabled")
    .eq("id", flagId)
    .maybeSingle();

  await svc.from("feature_flags").delete().eq("id", flagId);

  await svc.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    target_user_id: userId || null,
    action: "delete_feature_flag",
    before_value: before ?? null,
    after_value: null,
  });

  revalidatePath(`/admin/tenants/${userId}`);
}

async function setGlobalFeatureFlag(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user: admin },
  } = await supabase.auth.getUser();
  if (!admin || admin.user_metadata?.is_admin !== true) return;

  const flagName = (formData.get("flagName") as string).trim();
  const enabled = formData.get("enabled") === "true";
  const userId = formData.get("userId") as string;
  if (!flagName) return;

  const svc = createServiceClient();
  await svc.from("feature_flags").upsert(
    {
      user_id: null,
      flag_name: flagName,
      enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,flag_name" },
  );

  await svc.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    target_user_id: null,
    action: "set_global_feature_flag",
    before_value: null,
    after_value: { flag_name: flagName, enabled },
  });

  revalidatePath(`/admin/tenants/${userId}`);
}

async function deleteTenantFromDetail(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user: admin },
  } = await supabase.auth.getUser();
  if (!admin || admin.user_metadata?.is_admin !== true) return;

  const userId = formData.get("userId") as string;
  const confirmedEmail = (formData.get("confirmedEmail") as string).trim();
  const expectedEmail = (formData.get("expectedEmail") as string).trim();
  if (!userId || confirmedEmail !== expectedEmail) return;

  const svc = createServiceClient();
  await svc.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    target_user_id: userId,
    action: "delete_tenant",
    before_value: { email: expectedEmail },
    after_value: null,
  });

  await svc.auth.admin.deleteUser(userId);
  redirect("/admin");
}

// ─── helpers ──────────────────────────────────────────────────────────────

const QUOTA_DEFAULTS: TenantQuotaRow = {
  daily_chat_tokens: 100000,
  daily_tool_calls: 500,
  tokens_used_today: 0,
  tool_calls_used_today: 0,
  daily_chat_tokens_override: null,
  daily_tool_calls_override: null,
  daily_demo_turns: 50,
  demo_turns_used_today: 0,
  last_reset: new Date().toISOString().slice(0, 10),
};

function UsageBar({ used, cap }: { used: number; cap: number }) {
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  const color =
    pct > 80 ? "var(--color-danger)" : pct > 60 ? "var(--color-amber)" : "var(--color-primary)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 6,
          borderRadius: 3,
          background: "var(--color-border)",
          overflow: "hidden",
        }}
      >
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
        {used.toLocaleString()} / {cap.toLocaleString()}
      </span>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 13,
  background: "var(--color-surface)",
  color: "var(--color-text)",
  width: 140,
};

const btnStyle: React.CSSProperties = {
  background: "var(--color-primary)",
  color: "var(--color-text-on-cta)",
  border: "none",
  borderRadius: 6,
  padding: "7px 12px",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};

const panelStyle: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  overflow: "hidden",
  marginBottom: 20,
};

const panelHeadStyle: React.CSSProperties = {
  padding: "12px 16px",
  borderBottom: "1px solid var(--color-border)",
  fontWeight: 600,
  fontSize: 13,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 16px",
  borderBottom: "1px solid var(--color-border)",
  fontSize: 13,
  gap: 8,
};

const labelStyle: React.CSSProperties = {
  color: "var(--color-text-muted)",
  fontSize: 12,
  minWidth: 140,
};

// ─── page ─────────────────────────────────────────────────────────────────

export default async function TenantDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const svc = createServiceClient();

  const [
    { data: userData },
    { data: profileRows },
    { data: integrationRows },
    { data: sessionRows },
    { data: quotaRow },
    { data: flagRows },
    { data: auditRows },
  ] = await Promise.all([
    svc.auth.admin.getUserById(userId),
    svc.from("profile").select("key, value").eq("user_id", userId).order("key"),
    svc
      .from("user_integrations")
      .select("provider, connected_at, scopes")
      .eq("user_id", userId)
      .order("connected_at"),
    svc
      .from("chat_sessions")
      .select("id, started_at, last_active_at, summary")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("last_active_at", { ascending: false })
      .limit(20),
    svc.from("tenant_quotas").select("*").eq("user_id", userId).maybeSingle(),
    svc
      .from("feature_flags")
      .select("*")
      .or(`user_id.eq.${userId},user_id.is.null`)
      .order("flag_name"),
    svc
      .from("admin_audit_log")
      .select("*")
      .eq("target_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (!userData?.user) {
    return <p style={{ color: "var(--color-text-muted)" }}>Tenant not found.</p>;
  }

  const detail: TenantDetail = {
    user: {
      id: userData.user.id,
      email: userData.user.email ?? "(no email)",
      created_at: userData.user.created_at,
      last_sign_in_at: userData.user.last_sign_in_at ?? null,
    },
    profile: (profileRows ?? []) as TenantProfileEntry[],
    integrations: (integrationRows ?? []) as TenantIntegration[],
    sessions: (sessionRows ?? []) as TenantChatSession[],
    quota: (quotaRow as TenantQuotaRow | null) ?? null,
    flags: (flagRows ?? []) as FeatureFlagRow[],
    auditLog: (auditRows ?? []) as AdminAuditLogRow[],
  };

  const q = detail.quota ?? QUOTA_DEFAULTS;
  const tokenCap = q.daily_chat_tokens_override ?? q.daily_chat_tokens;
  const toolCap = q.daily_tool_calls_override ?? q.daily_tool_calls;

  // Separate per-user flags from global flags
  const userFlags = detail.flags.filter((f) => f.user_id === userId);
  const globalFlags = detail.flags.filter((f) => f.user_id === null);
  const allFlagNames = Array.from(
    new Set([...userFlags.map((f) => f.flag_name), ...globalFlags.map((f) => f.flag_name)]),
  ).sort();

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
        <a
          href="/admin"
          style={{ color: "var(--color-text-muted)", textDecoration: "none", fontSize: 13 }}
        >
          ← Tenants
        </a>
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>{detail.user.email}</h1>
      </div>
      <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 32 }}>
        ID: {detail.user.id} · Created {new Date(detail.user.created_at).toLocaleString()} · Last
        sign-in:{" "}
        {detail.user.last_sign_in_at
          ? new Date(detail.user.last_sign_in_at).toLocaleString()
          : "never"}
      </p>

      {/* 2-col grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
          gap: 24,
          alignItems: "start",
        }}
      >
        {/* LEFT COLUMN */}
        <div>
          {/* Profile */}
          <section style={panelStyle}>
            <div style={panelHeadStyle}>Profile</div>
            {detail.profile.length === 0 ? (
              <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-text-muted)" }}>
                No profile entries.
              </div>
            ) : (
              detail.profile.map((p, i) => (
                <div
                  key={p.key}
                  style={{
                    ...rowStyle,
                    borderBottom:
                      i < detail.profile.length - 1 ? "1px solid var(--color-border)" : "none",
                  }}
                >
                  <span style={labelStyle}>{p.key}</span>
                  <span
                    style={{
                      fontSize: 13,
                      textAlign: "right",
                      wordBreak: "break-all",
                      maxWidth: 240,
                    }}
                  >
                    {p.value ?? "—"}
                  </span>
                </div>
              ))
            )}
          </section>

          {/* Integrations */}
          <section style={panelStyle}>
            <div style={panelHeadStyle}>Integrations ({detail.integrations.length})</div>
            {detail.integrations.length === 0 ? (
              <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-text-muted)" }}>
                No integrations connected.
              </div>
            ) : (
              detail.integrations.map((intg, i) => (
                <div
                  key={intg.provider}
                  style={{
                    ...rowStyle,
                    borderBottom:
                      i < detail.integrations.length - 1 ? "1px solid var(--color-border)" : "none",
                  }}
                >
                  <span style={{ fontWeight: 500, textTransform: "capitalize" }}>
                    {intg.provider}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    Connected {new Date(intg.connected_at).toLocaleDateString()}
                  </span>
                </div>
              ))
            )}
          </section>

          {/* Last 20 chat sessions */}
          <section style={panelStyle}>
            <div style={panelHeadStyle}>Last 20 chat sessions</div>
            {detail.sessions.length === 0 ? (
              <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-text-muted)" }}>
                No sessions.
              </div>
            ) : (
              detail.sessions.map((s, i) => (
                <div
                  key={s.id}
                  style={{
                    padding: "10px 16px",
                    borderBottom:
                      i < detail.sessions.length - 1 ? "1px solid var(--color-border)" : "none",
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                      {new Date(s.last_active_at).toLocaleString()}
                    </span>
                  </div>
                  {s.summary && (
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 12,
                        color: "var(--color-text-muted)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.summary}
                    </p>
                  )}
                </div>
              ))
            )}
          </section>
        </div>

        {/* RIGHT COLUMN */}
        <div>
          {/* Rate-limit overrides — topmost, most important */}
          <section style={panelStyle}>
            <div style={panelHeadStyle}>Rate-limit overrides</div>

            {/* Token usage + override */}
            <div style={{ padding: "16px 16px 0" }}>
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>
                Daily chat tokens
              </p>
              <UsageBar used={q.tokens_used_today} cap={tokenCap} />
              <p
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  margin: "4px 0 12px",
                }}
              >
                Base: {q.daily_chat_tokens.toLocaleString()} · Override:{" "}
                {q.daily_chat_tokens_override != null
                  ? q.daily_chat_tokens_override.toLocaleString()
                  : "none (using base)"}
              </p>
              <form
                action={updateTokenOverride}
                style={{ display: "flex", gap: 8, marginBottom: 16 }}
              >
                <input type="hidden" name="userId" value={userId} />
                <input
                  name="tokenOverride"
                  type="number"
                  min={0}
                  placeholder={
                    q.daily_chat_tokens_override != null
                      ? String(q.daily_chat_tokens_override)
                      : "clear override"
                  }
                  style={inputStyle}
                />
                <button type="submit" style={btnStyle}>
                  Set
                </button>
              </form>
            </div>

            {/* Tool call usage + override */}
            <div style={{ padding: "0 16px 0", borderTop: "1px solid var(--color-border)" }}>
              <div style={{ height: 16 }} />
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>
                Daily tool calls
              </p>
              <UsageBar used={q.tool_calls_used_today} cap={toolCap} />
              <p
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  margin: "4px 0 12px",
                }}
              >
                Base: {q.daily_tool_calls} · Override:{" "}
                {q.daily_tool_calls_override != null
                  ? q.daily_tool_calls_override
                  : "none (using base)"}
              </p>
              <form
                action={updateToolCallOverride}
                style={{ display: "flex", gap: 8, marginBottom: 16 }}
              >
                <input type="hidden" name="userId" value={userId} />
                <input
                  name="toolCallOverride"
                  type="number"
                  min={0}
                  placeholder={
                    q.daily_tool_calls_override != null
                      ? String(q.daily_tool_calls_override)
                      : "clear override"
                  }
                  style={inputStyle}
                />
                <button type="submit" style={btnStyle}>
                  Set
                </button>
              </form>
            </div>

            {/* Reset today's usage */}
            <div
              style={{
                padding: "12px 16px",
                borderTop: "1px solid var(--color-border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Reset today&apos;s usage counters to zero
              </span>
              <form action={resetQuotaToday}>
                <input type="hidden" name="userId" value={userId} />
                <button
                  type="submit"
                  style={{
                    ...btnStyle,
                    background: "var(--color-surface)",
                    color: "var(--color-text)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  Reset
                </button>
              </form>
            </div>
          </section>

          {/* Feature flags */}
          <section style={panelStyle}>
            <div style={panelHeadStyle}>Feature flags</div>

            {allFlagNames.length === 0 ? (
              <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-text-muted)" }}>
                No flags defined yet.
              </div>
            ) : (
              allFlagNames.map((flagName, i) => {
                const userFlag = userFlags.find((f) => f.flag_name === flagName);
                const globalFlag = globalFlags.find((f) => f.flag_name === flagName);
                const effectiveEnabled = userFlag?.enabled ?? globalFlag?.enabled ?? false;
                const hasOverride = !!userFlag;
                return (
                  <div
                    key={flagName}
                    style={{
                      ...rowStyle,
                      borderBottom:
                        i < allFlagNames.length - 1 ? "1px solid var(--color-border)" : "none",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <span style={{ fontWeight: 500, fontSize: 13 }}>{flagName}</span>
                      <br />
                      <span style={{ fontSize: 11, color: "var(--color-text-muted)" }}>
                        {hasOverride
                          ? `per-user override · global: ${globalFlag?.enabled ? "on" : "off"}`
                          : "global default"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: effectiveEnabled
                            ? "var(--color-positive)"
                            : "var(--color-text-muted)",
                        }}
                      >
                        {effectiveEnabled ? "ON" : "OFF"}
                      </span>
                      <form action={setFeatureFlag}>
                        <input type="hidden" name="userId" value={userId} />
                        <input type="hidden" name="flagName" value={flagName} />
                        <input type="hidden" name="newEnabled" value={String(!effectiveEnabled)} />
                        <button
                          type="submit"
                          style={{ ...btnStyle, fontSize: 11, padding: "5px 10px" }}
                        >
                          {effectiveEnabled ? "Disable" : "Enable"}
                        </button>
                      </form>
                      {hasOverride && userFlag && (
                        <form action={deleteFeatureFlag}>
                          <input type="hidden" name="flagId" value={userFlag.id} />
                          <input type="hidden" name="userId" value={userId} />
                          <button
                            type="submit"
                            style={{
                              ...btnStyle,
                              background: "none",
                              color: "var(--color-text-muted)",
                              border: "1px solid var(--color-border)",
                              fontSize: 11,
                              padding: "5px 10px",
                            }}
                          >
                            Clear override
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Add/set global flag */}
            <div
              style={{
                padding: "12px 16px",
                borderTop: "1px solid var(--color-border)",
                background: "var(--color-surface)",
              }}
            >
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 8 }}>
                Set global flag default
              </p>
              <form
                action={setGlobalFeatureFlag}
                style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
              >
                <input type="hidden" name="userId" value={userId} />
                <input
                  name="flagName"
                  type="text"
                  required
                  placeholder="flag_name"
                  style={{ ...inputStyle, width: 160 }}
                />
                <select
                  name="enabled"
                  style={{
                    ...inputStyle,
                    width: "auto",
                  }}
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
                <button type="submit" style={btnStyle}>
                  Set global
                </button>
              </form>
            </div>
          </section>

          {/* Audit log */}
          <section style={panelStyle}>
            <div style={panelHeadStyle}>Audit log (last 20)</div>
            {detail.auditLog.length === 0 ? (
              <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--color-text-muted)" }}>
                No audit entries yet.
              </div>
            ) : (
              detail.auditLog.map((row, i) => (
                <div
                  key={row.id}
                  style={{
                    padding: "10px 16px",
                    borderBottom:
                      i < detail.auditLog.length - 1 ? "1px solid var(--color-border)" : "none",
                    fontSize: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontWeight: 500 }}>{row.action}</span>
                    <span style={{ color: "var(--color-text-muted)" }}>
                      {new Date(row.created_at).toLocaleString()}
                    </span>
                  </div>
                  {(row.before_value != null || row.after_value != null) && (
                    <p
                      style={{
                        margin: "4px 0 0",
                        color: "var(--color-text-muted)",
                        fontFamily: "monospace",
                        fontSize: 11,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.before_value != null && `before: ${JSON.stringify(row.before_value)}`}
                      {row.before_value != null && row.after_value != null && " → "}
                      {row.after_value != null && `after: ${JSON.stringify(row.after_value)}`}
                    </p>
                  )}
                </div>
              ))
            )}
          </section>
        </div>
      </div>

      {/* Delete tenant — bottom of page, destructive */}
      <section
        style={{
          marginTop: 48,
          border: "1px solid var(--color-danger)",
          borderRadius: 8,
          padding: "20px 24px",
        }}
      >
        <h2
          style={{ fontSize: 14, fontWeight: 600, color: "var(--color-danger)", marginBottom: 8 }}
        >
          Delete tenant
        </h2>
        <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>
          This permanently deletes the account and all associated data. Type{" "}
          <strong style={{ color: "var(--color-text)" }}>{detail.user.email}</strong> to confirm.
        </p>
        <form
          action={deleteTenantFromDetail}
          style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
        >
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="expectedEmail" value={detail.user.email} />
          <input
            name="confirmedEmail"
            type="email"
            required
            placeholder={detail.user.email}
            style={{ ...inputStyle, borderColor: "var(--color-danger)", width: 240 }}
          />
          <button
            type="submit"
            style={{
              background: "var(--color-danger)",
              color: "var(--color-bg)",
              border: "none",
              borderRadius: 6,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Delete tenant
          </button>
        </form>
      </section>
    </div>
  );
}
