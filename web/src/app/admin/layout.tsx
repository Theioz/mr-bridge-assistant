import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.user_metadata?.is_admin !== true) {
    notFound();
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        color: "var(--color-text)",
        background: "var(--color-bg)",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid var(--color-border)",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 15 }}>Mr. Bridge Admin</span>
        <a
          href="/dashboard"
          style={{
            fontSize: 13,
            color: "var(--color-text-muted)",
            textDecoration: "none",
            marginLeft: "auto",
          }}
        >
          ← Back to app
        </a>
        <form
          action={async () => {
            "use server";
            const sb = await createClient();
            await sb.auth.signOut();
          }}
        >
          <button
            type="submit"
            style={{
              fontSize: 13,
              color: "var(--color-text-muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Sign out
          </button>
        </form>
      </header>
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>{children}</main>
    </div>
  );
}
