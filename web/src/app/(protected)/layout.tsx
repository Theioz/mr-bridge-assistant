import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Nav from "@/components/nav";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div
      className="flex min-h-screen"
      style={{ background: "var(--color-bg)", color: "var(--color-text)" }}
    >
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
      {/* ml-0 on mobile (nav is bottom bar), ml-60 on desktop (240px sidebar) */}
      {/* pb-16 on mobile to clear the 56px bottom tab bar */}
      {/* pb accounts for 56px tab bar + safe-area-inset-bottom on iOS */}
      <main
        id="main-content"
        className="flex-1 ml-0 lg:ml-60 px-5 lg:px-8 pt-8 pb-[calc(56px+env(safe-area-inset-bottom)+16px)] lg:pb-8 min-w-0"
      >
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
