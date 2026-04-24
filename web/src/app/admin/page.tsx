export const dynamic = "force-dynamic";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { AdminTenant, TenantQuotaRow } from "@/lib/admin-types";

async function createTenant(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user: admin },
  } = await supabase.auth.getUser();
  if (!admin || admin.user_metadata?.is_admin !== true) return;

  const email = (formData.get("email") as string).trim();
  const password = (formData.get("password") as string).trim();
  if (!email || !password) return;

  const svc = createServiceClient();
  const { data: created, error } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !created.user) return;

  await svc.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    target_user_id: created.user.id,
    action: "create_tenant",
    before_value: null,
    after_value: { email },
  });

  revalidatePath("/admin");
}

async function deleteTenant(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const {
    data: { user: admin },
  } = await supabase.auth.getUser();
  if (!admin || admin.user_metadata?.is_admin !== true) return;

  const targetUserId = formData.get("targetUserId") as string;
  const confirmedEmail = (formData.get("confirmedEmail") as string).trim();
  const expectedEmail = (formData.get("expectedEmail") as string).trim();

  if (!targetUserId || !confirmedEmail || confirmedEmail !== expectedEmail) return;

  const svc = createServiceClient();

  await svc.from("admin_audit_log").insert({
    admin_user_id: admin.id,
    target_user_id: targetUserId,
    action: "delete_tenant",
    before_value: { email: expectedEmail },
    after_value: null,
  });

  await svc.auth.admin.deleteUser(targetUserId);
  revalidatePath("/admin");
}

export default async function AdminPage() {
  const svc = createServiceClient();

  const [{ data: listResult }, { data: quotas }, { data: integrations }] = await Promise.all([
    svc.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    svc.from("tenant_quotas").select("*"),
    svc.from("user_integrations").select("user_id"),
  ]);

  const users = listResult?.users ?? [];
  const quotaMap = new Map<string, TenantQuotaRow>(
    (quotas ?? []).map((q) => [q.user_id, q as TenantQuotaRow]),
  );
  const integrationCounts = new Map<string, number>();
  for (const row of integrations ?? []) {
    integrationCounts.set(row.user_id, (integrationCounts.get(row.user_id) ?? 0) + 1);
  }

  const tenants: AdminTenant[] = users.map((u) => {
    const q = quotaMap.get(u.id);
    const tokenCap = q?.daily_chat_tokens_override ?? q?.daily_chat_tokens ?? 500000;
    const toolCap = q?.daily_tool_calls_override ?? q?.daily_tool_calls ?? 500;
    return {
      id: u.id,
      email: u.email ?? "(no email)",
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      tokens_used_today: q?.tokens_used_today ?? 0,
      token_cap: tokenCap,
      tool_calls_used_today: q?.tool_calls_used_today ?? 0,
      tool_calls_cap: toolCap,
      integration_count: integrationCounts.get(u.id) ?? 0,
    };
  });

  tenants.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>Tenants</h1>

      {/* Create tenant */}
      <section
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          padding: "20px 24px",
          marginBottom: 32,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Create tenant</h2>
        <form
          action={createTenant}
          style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label
              htmlFor="create-email"
              style={{ fontSize: 12, color: "var(--color-text-muted)" }}
            >
              Email
            </label>
            <input
              id="create-email"
              name="email"
              type="email"
              required
              placeholder="user@example.com"
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                padding: "7px 10px",
                fontSize: 13,
                background: "var(--color-surface)",
                color: "var(--color-text)",
                width: 220,
              }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label
              htmlFor="create-password"
              style={{ fontSize: 12, color: "var(--color-text-muted)" }}
            >
              Password
            </label>
            <input
              id="create-password"
              name="password"
              type="password"
              required
              minLength={8}
              placeholder="min 8 chars"
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                padding: "7px 10px",
                fontSize: 13,
                background: "var(--color-surface)",
                color: "var(--color-text)",
                width: 180,
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              background: "var(--color-primary)",
              color: "var(--color-text-on-cta)",
              border: "none",
              borderRadius: 6,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Create
          </button>
        </form>
      </section>

      {/* Tenant table */}
      <section
        style={{ border: "1px solid var(--color-border)", borderRadius: 8, overflow: "hidden" }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {[
                  "Email",
                  "Created",
                  "Last sign-in",
                  "Tokens today",
                  "Tool calls today",
                  "Integrations",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "10px 16px",
                      textAlign: "left",
                      fontWeight: 600,
                      fontSize: 12,
                      color: "var(--color-text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 500 }}>{t.email}</td>
                  <td
                    style={{
                      padding: "12px 16px",
                      color: "var(--color-text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      color: "var(--color-text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.last_sign_in_at ? new Date(t.last_sign_in_at).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                    <span
                      style={{
                        color:
                          t.tokens_used_today / t.token_cap > 0.8
                            ? "var(--color-amber)"
                            : "var(--color-text)",
                      }}
                    >
                      {t.tokens_used_today.toLocaleString()} / {t.token_cap.toLocaleString()}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                    {t.tool_calls_used_today} / {t.tool_calls_cap}
                  </td>
                  <td style={{ padding: "12px 16px" }}>{t.integration_count}</td>
                  <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                    <a
                      href={`/admin/tenants/${t.id}`}
                      style={{
                        color: "var(--color-primary)",
                        textDecoration: "none",
                        fontSize: 12,
                        fontWeight: 500,
                        marginRight: 12,
                      }}
                    >
                      Inspect →
                    </a>
                    <details style={{ display: "inline-block" }}>
                      <summary
                        style={{
                          fontSize: 12,
                          color: "var(--color-danger)",
                          cursor: "pointer",
                          listStyle: "none",
                        }}
                      >
                        Delete
                      </summary>
                      <div
                        style={{
                          position: "absolute",
                          background: "var(--color-surface)",
                          border: "1px solid var(--color-border)",
                          borderRadius: 8,
                          padding: 16,
                          zIndex: 10,
                          minWidth: 280,
                          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                        }}
                      >
                        <p
                          style={{
                            fontSize: 12,
                            marginBottom: 10,
                            color: "var(--color-text-muted)",
                          }}
                        >
                          Type <strong style={{ color: "var(--color-text)" }}>{t.email}</strong> to
                          confirm deletion. This is irreversible.
                        </p>
                        <form
                          action={deleteTenant}
                          style={{ display: "flex", flexDirection: "column", gap: 8 }}
                        >
                          <input type="hidden" name="targetUserId" value={t.id} />
                          <input type="hidden" name="expectedEmail" value={t.email} />
                          <input
                            name="confirmedEmail"
                            type="email"
                            required
                            placeholder={t.email}
                            style={{
                              border: "1px solid var(--color-danger)",
                              borderRadius: 6,
                              padding: "6px 10px",
                              fontSize: 12,
                              background: "var(--color-surface)",
                              color: "var(--color-text)",
                            }}
                          />
                          <button
                            type="submit"
                            style={{
                              background: "var(--color-danger)",
                              color: "var(--color-bg)",
                              border: "none",
                              borderRadius: 6,
                              padding: "7px 12px",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: "pointer",
                            }}
                          >
                            Delete tenant
                          </button>
                        </form>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)" }}
                  >
                    No tenants found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
