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
      <Nav />
      {/* ml-0 on mobile (nav is bottom bar), ml-60 on desktop (240px sidebar) */}
      {/* pb-16 on mobile to clear the 56px bottom tab bar */}
      <main className="flex-1 ml-0 lg:ml-60 px-5 lg:px-8 pt-8 pb-20 lg:pb-8 min-w-0">
        <div className="max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
