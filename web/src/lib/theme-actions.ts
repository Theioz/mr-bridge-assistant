"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ThemePreference } from "@/lib/theme";

export async function setThemePreference(pref: ThemePreference) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  if (pref === "system") {
    await supabase
      .from("profile")
      .delete()
      .eq("user_id", user.id)
      .eq("key", "theme_preference");
  } else {
    await supabase
      .from("profile")
      .upsert(
        { user_id: user.id, key: "theme_preference", value: pref },
        { onConflict: "user_id,key" },
      );
  }
  revalidatePath("/", "layout");
}
