export const dynamic = "force-dynamic";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

  const { error: deleteError } = await svc.auth.admin.deleteUser(targetUserId);
  if (deleteError) {
    redirect(`/admin?deleteError=${encodeURIComponent(deleteError.message)}`);
  }
  revalidatePath("/admin");
  redirect("/admin");
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const params = await searchParams;
  const deleteError = params.deleteError ?? null;
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

  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--color-border)",
    borderRadius: "var(--r-1)",
    padding: "var(--space-2) var(--space-3)",
    fontSize: "var(--t-meta)",
    background: "var(--color-surface)",
    color: "var(--color-text)",
  };

  return (
    <div>
      <h1
        style={{
          fontSize: "var(--t-h1)",
          fontWeight: 600,
          marginBottom: "var(--space-6)",
        }}
      >
        Admin
      </h1>

      {deleteError && (
        <p
          role="alert"
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-danger)",
            border: "1px solid var(--color-danger)",
            borderRadius: "var(--r-1)",
            padding: "var(--space-3) var(--space-4)",
            marginBottom: "var(--space-5)",
          }}
        >
          Delete failed: {deleteError}
        </p>
      )}

      {/* Create tenant */}
      <section
        style={{
          paddingBottom: "var(--space-6)",
          borderBottom: "1px solid var(--rule-soft)",
          marginBottom: "var(--space-6)",
        }}
      >
        <h2 className="db-section-label">Create tenant</h2>
        <form
          action={createTenant}
          style={{
            display: "flex",
            gap: "var(--space-3)",
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <label
              htmlFor="create-email"
              style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}
            >
              Email
            </label>
            <input
              id="create-email"
              name="email"
              type="email"
              required
              placeholder="user@example.com"
              style={{ ...inputStyle, width: 220 }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <label
              htmlFor="create-password"
              style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}
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
              style={{ ...inputStyle, width: 180 }}
            />
          </div>
          <button
            type="submit"
            style={{
              background: "var(--color-primary)",
              color: "var(--color-text-on-cta)",
              border: "none",
              borderRadius: "var(--r-1)",
              padding: "var(--space-2) var(--space-4)",
              fontSize: "var(--t-meta)",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Create
          </button>
        </form>
      </section>

      {/* Tenant table */}
      <section>
        <h2 className="db-section-label">
          Tenants <span className="meta">{tenants.length}</span>
        </h2>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "var(--t-meta)",
            }}
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--rule)" }}>
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
                      padding: "var(--space-2) var(--space-4) var(--space-3)",
                      textAlign: "left",
                      fontWeight: 600,
                      fontSize: "var(--t-micro)",
                      color: "var(--color-text-faint)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
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
                <tr key={t.id} style={{ borderBottom: "1px solid var(--rule-soft)" }}>
                  <td style={{ padding: "var(--space-3) var(--space-4)", fontWeight: 500 }}>
                    {t.email}
                  </td>
                  <td
                    style={{
                      padding: "var(--space-3) var(--space-4)",
                      color: "var(--color-text-muted)",
                      fontSize: "var(--t-micro)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td
                    style={{
                      padding: "var(--space-3) var(--space-4)",
                      color: "var(--color-text-muted)",
                      fontSize: "var(--t-micro)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {t.last_sign_in_at ? new Date(t.last_sign_in_at).toLocaleDateString() : "—"}
                  </td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", whiteSpace: "nowrap" }}>
                    <span
                      style={{
                        color:
                          t.tokens_used_today / t.token_cap > 0.8
                            ? "var(--color-amber)"
                            : "var(--color-text)",
                        fontSize: "var(--t-micro)",
                      }}
                    >
                      {t.tokens_used_today.toLocaleString()} / {t.token_cap.toLocaleString()}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: "var(--space-3) var(--space-4)",
                      whiteSpace: "nowrap",
                      fontSize: "var(--t-micro)",
                    }}
                  >
                    {t.tool_calls_used_today} / {t.tool_calls_cap}
                  </td>
                  <td
                    style={{
                      padding: "var(--space-3) var(--space-4)",
                      fontSize: "var(--t-micro)",
                    }}
                  >
                    {t.integration_count}
                  </td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", whiteSpace: "nowrap" }}>
                    <a
                      href={`/admin/tenants/${t.id}`}
                      style={{
                        color: "var(--color-primary)",
                        textDecoration: "none",
                        fontSize: "var(--t-micro)",
                        fontWeight: 500,
                        marginRight: "var(--space-4)",
                      }}
                    >
                      Inspect →
                    </a>
                    <details style={{ display: "inline-block", position: "relative" }}>
                      <summary
                        style={{
                          fontSize: "var(--t-micro)",
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
                          right: 0,
                          background: "var(--color-surface-raised)",
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--r-2)",
                          padding: "var(--space-4)",
                          zIndex: 10,
                          minWidth: 280,
                          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                        }}
                      >
                        <p
                          style={{
                            fontSize: "var(--t-micro)",
                            marginBottom: "var(--space-3)",
                            color: "var(--color-text-muted)",
                          }}
                        >
                          Type <strong style={{ color: "var(--color-text)" }}>{t.email}</strong> to
                          confirm deletion. This is irreversible.
                        </p>
                        <form
                          action={deleteTenant}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "var(--space-2)",
                          }}
                        >
                          <input type="hidden" name="targetUserId" value={t.id} />
                          <input type="hidden" name="expectedEmail" value={t.email} />
                          <input
                            name="confirmedEmail"
                            type="email"
                            required
                            placeholder={t.email}
                            style={{
                              ...inputStyle,
                              borderColor: "var(--color-danger)",
                            }}
                          />
                          <button
                            type="submit"
                            style={{
                              background: "var(--color-danger)",
                              color: "var(--color-bg)",
                              border: "none",
                              borderRadius: "var(--r-1)",
                              padding: "var(--space-2) var(--space-3)",
                              fontSize: "var(--t-micro)",
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
                    style={{
                      padding: "var(--space-7)",
                      textAlign: "center",
                      color: "var(--color-text-muted)",
                      fontSize: "var(--t-meta)",
                    }}
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
