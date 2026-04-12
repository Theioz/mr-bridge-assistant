export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { ProfileForm } from "@/components/settings/profile-form";

async function updateProfile(key: string, value: string) {
  "use server";
  const supabase = await createClient();
  await supabase
    .from("profile")
    .upsert({ key, value }, { onConflict: "key" });
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

async function deleteProfile(key: string) {
  "use server";
  const supabase = await createClient();
  await supabase.from("profile").delete().eq("key", key);
  revalidatePath("/settings");
  revalidatePath("/dashboard");
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("profile").select("key,value");

  const values: Record<string, string> = {};
  for (const row of data ?? []) {
    values[row.key] = row.value;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-heading font-semibold" style={{ fontSize: 24, color: "var(--color-text)" }}>
          Settings
        </h1>
        <p className="mt-1" style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
          Edit and save changes inline. Press Enter or click Save on any field.
        </p>
      </div>

      <ProfileForm
        values={values}
        updateAction={updateProfile}
        deleteAction={deleteProfile}
      />
    </div>
  );
}
