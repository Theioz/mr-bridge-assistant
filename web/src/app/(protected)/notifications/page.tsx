export const dynamic = "force-dynamic";

import { cache } from "react";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import NotificationList from "@/components/notifications/notification-list";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Recent alerts and activity.",
};

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  sent_at: string;
  read_at: string | null;
  isUnread: boolean;
}

async function markAllAsReadAction(): Promise<{ error?: string }> {
  "use server";
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "Unauthorized" };
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) return { error: error.message };
    revalidatePath("/notifications");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to mark read" };
  }
}

// Extracted so the render body stays free of impure calls (Date.now, DB writes)
// that react-hooks/purity would otherwise flag. cache() dedupes within a single
// request if this ever gets called twice.
const loadNotificationsPage = cache(async () => {
  const supabase = await createClient();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Run auth and data fetch in parallel — RLS filters by JWT; user.id is only
  // needed for the subsequent mark-as-read update.
  const [
    {
      data: { user },
    },
    { data: rows },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("notifications")
      .select("id, type, title, body, sent_at, read_at")
      .gte("sent_at", cutoff)
      .order("sent_at", { ascending: false })
      .limit(50),
  ]);
  if (!user) return null;

  const notifications: Notification[] = (rows ?? []).map((n) => ({
    ...n,
    isUnread: n.read_at === null,
  }));

  // Mark all fetched unread notifications as read in a single update.
  // The visual pin state is captured above from the pre-update snapshot, so
  // the amber dots still render for this session even though the DB is clean.
  const unreadIds = notifications.filter((n) => n.isUnread).map((n) => n.id);
  if (unreadIds.length > 0) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
  }

  return { notifications };
});

export default async function NotificationsPage() {
  const data = await loadNotificationsPage();
  if (!data) return null;
  const { notifications } = data;

  return (
    <div className="max-w-2xl">
      <header style={{ marginBottom: "var(--space-5)" }}>
        <h1
          className="font-heading"
          style={{
            fontSize: "var(--t-h1)",
            fontWeight: 600,
            color: "var(--color-text)",
            letterSpacing: "-0.02em",
          }}
        >
          Notifications
        </h1>
        <p
          className="mt-1"
          style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}
        >
          Last 30 days
        </p>
      </header>

      <NotificationList notifications={notifications} markAllAsReadAction={markAllAsReadAction} />
    </div>
  );
}
