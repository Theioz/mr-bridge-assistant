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
} from "@/lib/admin-types";
import { USER_TZ } from "@/lib/timezone";

// ─── server actions ────────────────────────────────────────────────────────

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

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--r-1)",
  padding: "var(--space-2) var(--space-3)",
  fontSize: "var(--t-meta)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
  width: 140,
};

const btnStyle: React.CSSProperties = {
  background: "var(--color-primary)",
  color: "var(--color-text-on-cta)",
  border: "none",
  borderRadius: "var(--r-1)",
  padding: "var(--space-2) var(--space-3)",
  fontSize: "var(--t-micro)",
  fontWeight: 500,
  cursor: "pointer",
};

const panelStyle: React.CSSProperties = {
  paddingTop: "var(--space-5)",
  paddingBottom: "var(--space-5)",
  borderBottom: "1px solid var(--rule-soft)",
  marginBottom: "var(--space-5)",
};

const panelHeadStyle: React.CSSProperties = {
  marginBottom: "var(--space-4)",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "var(--space-2) 0",
  borderBottom: "1px solid var(--rule-soft)",
  fontSize: "var(--t-meta)",
  gap: "var(--space-2)",
};

const labelStyle: React.CSSProperties = {
  color: "var(--color-text-muted)",
  fontSize: "var(--t-micro)",
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
    flags: (flagRows ?? []) as FeatureFlagRow[],
    auditLog: (auditRows ?? []) as AdminAuditLogRow[],
  };

  // Separate per-user flags from global flags
  const userFlags = detail.flags.filter((f) => f.user_id === userId);
  const globalFlags = detail.flags.filter((f) => f.user_id === null);
  const allFlagNames = Array.from(
    new Set([...userFlags.map((f) => f.flag_name), ...globalFlags.map((f) => f.flag_name)]),
  ).sort();

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: "var(--space-2)" }}>
        <a
          href="/admin"
          style={{
            color: "var(--color-text-muted)",
            textDecoration: "none",
            fontSize: "var(--t-micro)",
          }}
        >
          ← Admin
        </a>
      </div>
      <h1
        style={{
          fontSize: "var(--t-h1)",
          fontWeight: 600,
          marginBottom: "var(--space-2)",
        }}
      >
        {detail.user.email}
      </h1>
      <p
        style={{
          fontSize: "var(--t-micro)",
          color: "var(--color-text-muted)",
          marginBottom: "var(--space-6)",
        }}
      >
        ID: {detail.user.id} · Created{" "}
        {new Date(detail.user.created_at).toLocaleString("en-US", { timeZone: USER_TZ })} · Last
        sign-in:{" "}
        {detail.user.last_sign_in_at
          ? new Date(detail.user.last_sign_in_at).toLocaleString("en-US", { timeZone: USER_TZ })
          : "never"}
      </p>

      {/* 2-col grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
          gap: "var(--space-7)",
          alignItems: "start",
        }}
      >
        {/* LEFT COLUMN */}
        <div>
          {/* Profile */}
          <section style={panelStyle}>
            <h2 className="db-section-label" style={panelHeadStyle}>
              Profile
            </h2>
            {detail.profile.length === 0 ? (
              <p style={{ fontSize: "var(--t-meta)", color: "var(--color-text-muted)" }}>
                No profile entries.
              </p>
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
                      fontSize: "var(--t-meta)",
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
            <h2 className="db-section-label" style={panelHeadStyle}>
              Integrations <span className="meta">{detail.integrations.length}</span>
            </h2>
            {detail.integrations.length === 0 ? (
              <div
                style={{
                  fontSize: "var(--t-meta)",
                  color: "var(--color-text-muted)",
                  paddingBottom: "var(--space-2)",
                }}
              >
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
                  <span style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}>
                    Connected{" "}
                    {new Date(intg.connected_at).toLocaleDateString("en-US", { timeZone: USER_TZ })}
                  </span>
                </div>
              ))
            )}
          </section>

          {/* Last 20 chat sessions */}
          <section style={panelStyle}>
            <h2 className="db-section-label" style={panelHeadStyle}>
              Last 20 sessions
            </h2>
            {detail.sessions.length === 0 ? (
              <div
                style={{
                  fontSize: "var(--t-meta)",
                  color: "var(--color-text-muted)",
                  paddingBottom: "var(--space-2)",
                }}
              >
                No sessions.
              </div>
            ) : (
              detail.sessions.map((s, i) => (
                <div
                  key={s.id}
                  style={{
                    padding: "var(--space-2) 0",
                    borderBottom:
                      i < detail.sessions.length - 1 ? "1px solid var(--color-border)" : "none",
                    fontSize: "var(--t-meta)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "var(--space-2)",
                    }}
                  >
                    <span style={{ color: "var(--color-text-muted)", fontSize: "var(--t-micro)" }}>
                      {new Date(s.last_active_at).toLocaleString("en-US", { timeZone: USER_TZ })}
                    </span>
                  </div>
                  {s.summary && (
                    <p
                      style={{
                        margin: "var(--space-1) 0 0",
                        fontSize: "var(--t-micro)",
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
          {/* Feature flags */}
          <section style={panelStyle}>
            <h2 className="db-section-label" style={panelHeadStyle}>
              Feature flags
            </h2>

            {allFlagNames.length === 0 ? (
              <div
                style={{
                  fontSize: "var(--t-meta)",
                  color: "var(--color-text-muted)",
                  paddingBottom: "var(--space-2)",
                }}
              >
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
                      gap: "var(--space-2)",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <span style={{ fontWeight: 500, fontSize: "var(--t-meta)" }}>{flagName}</span>
                      <br />
                      <span
                        style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}
                      >
                        {hasOverride
                          ? `per-user override · global: ${globalFlag?.enabled ? "on" : "off"}`
                          : "global default"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                      <span
                        style={{
                          fontSize: "var(--t-micro)",
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
                          style={{
                            ...btnStyle,
                            fontSize: "var(--t-micro)",
                            padding: "var(--space-1) var(--space-2)",
                          }}
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
                              fontSize: "var(--t-micro)",
                              padding: "var(--space-1) var(--space-2)",
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
                padding: "var(--space-3) 0",
                borderTop: "1px solid var(--color-border)",
              }}
            >
              <p
                style={{
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-muted)",
                  marginBottom: "var(--space-2)",
                }}
              >
                Set global flag default
              </p>
              <form
                action={setGlobalFeatureFlag}
                style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}
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
            <h2 className="db-section-label" style={panelHeadStyle}>
              Audit log
            </h2>
            {detail.auditLog.length === 0 ? (
              <div
                style={{
                  fontSize: "var(--t-meta)",
                  color: "var(--color-text-muted)",
                  paddingBottom: "var(--space-2)",
                }}
              >
                No audit entries yet.
              </div>
            ) : (
              detail.auditLog.map((row, i) => (
                <div
                  key={row.id}
                  style={{
                    padding: "var(--space-2) 0",
                    borderBottom:
                      i < detail.auditLog.length - 1 ? "1px solid var(--color-border)" : "none",
                    fontSize: "var(--t-micro)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "var(--space-2)",
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{row.action}</span>
                    <span style={{ color: "var(--color-text-muted)" }}>
                      {new Date(row.created_at).toLocaleString("en-US", { timeZone: USER_TZ })}
                    </span>
                  </div>
                  {(row.before_value != null || row.after_value != null) && (
                    <p
                      style={{
                        margin: "var(--space-1) 0 0",
                        color: "var(--color-text-muted)",
                        fontFamily: "monospace",
                        fontSize: "var(--t-micro)",
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
          marginTop: "var(--space-10)",
          border: "1px solid var(--color-danger)",
          borderRadius: "var(--r-2)",
          padding: "var(--space-5) var(--space-6)",
        }}
      >
        <h2
          style={{
            fontSize: "var(--t-meta)",
            fontWeight: 600,
            color: "var(--color-danger)",
            marginBottom: "var(--space-2)",
          }}
        >
          Delete tenant
        </h2>
        <p
          style={{
            fontSize: "var(--t-meta)",
            color: "var(--color-text-muted)",
            marginBottom: "var(--space-4)",
          }}
        >
          This permanently deletes the account and all associated data. Type{" "}
          <strong style={{ color: "var(--color-text)" }}>{detail.user.email}</strong> to confirm.
        </p>
        <form
          action={deleteTenantFromDetail}
          style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}
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
              borderRadius: "var(--r-1)",
              padding: "var(--space-2) var(--space-4)",
              fontSize: "var(--t-meta)",
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
