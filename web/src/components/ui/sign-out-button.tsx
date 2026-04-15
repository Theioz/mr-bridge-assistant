"use client";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push("/login");
  }
  return (
    <button
      onClick={handleSignOut}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium w-full transition-colors duration-150 hover-text-brighten"
      style={{ color: "var(--color-text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
    >
      <LogOut size={18} strokeWidth={1.5} style={{ flexShrink: 0 }} />
      Sign out
    </button>
  );
}
