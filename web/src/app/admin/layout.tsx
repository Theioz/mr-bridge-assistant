import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.user_metadata?.is_admin !== true) {
    notFound();
  }

  return (
    <div className="flex min-h-screen" style={{ color: "var(--color-text)" }}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-lg"
        style={{
          background: "var(--color-primary)",
          color: "var(--color-text-on-cta)",
          padding: "10px 14px",
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        Skip to main content
      </a>
      <Nav />
      <main
        id="main-content"
        className="flex-1 ml-0 lg:ml-60 px-5 lg:px-8 pt-8 pb-[calc(56px+env(safe-area-inset-bottom)+16px)] lg:pb-8 min-w-0"
      >
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
