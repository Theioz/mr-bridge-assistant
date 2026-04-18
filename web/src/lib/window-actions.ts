"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import type { WindowKey } from "@/lib/window";

export async function setWindowPreference(key: WindowKey) {
  const store = await cookies();
  store.set("mb-window", key, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
