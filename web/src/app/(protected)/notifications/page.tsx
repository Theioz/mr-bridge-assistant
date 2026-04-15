export const dynamic = "force-dynamic";

import type { Metadata } from "next";
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

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch up to 50 notifications within the 30-day TTL window
  const { data: rows } = await supabase
    .from("notifications")
    .select("id, type, title, body, sent_at, read_at")
    .gte("sent_at", cutoff)
    .order("sent_at", { ascending: false })
    .limit(50);

  const notifications: Notification[] = (rows ?? []).map((n) => ({
    ...n,
    isUnread: n.read_at === null,
  }));

  // Mark all fetched unread notifications as read in a single update
  const unreadIds = notifications.filter((n) => n.isUnread).map((n) => n.id);
  if (unreadIds.length > 0) {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-heading font-semibold" style={{ fontSize: 24, color: "var(--color-text)" }}>
          Notifications
        </h1>
        <p className="mt-1" style={{ fontSize: 14, color: "var(--color-text-muted)" }}>
          Last 30 days
        </p>
      </div>

      <NotificationList notifications={notifications} />
    </div>
  );
}
