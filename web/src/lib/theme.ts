import { createClient } from "@/lib/supabase/server";

export type ThemePreference = "system" | "light" | "dark";

export async function getServerThemePreference(): Promise<ThemePreference> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "system";
    const { data } = await supabase
      .from("profile")
      .select("value")
      .eq("user_id", user.id)
      .eq("key", "theme_preference")
      .maybeSingle();
    const v = data?.value;
    if (v === "light" || v === "dark" || v === "system") return v;
    return "system";
  } catch {
    return "system";
  }
}
