"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Activity,
  CheckSquare,
  UtensilsCrossed,
  MessageSquare,
  Settings,
  ListTodo,
  BookOpen,
  BarChart2,
  Bell,
  MoreHorizontal,
  X,
  LogOut,
} from "lucide-react";
import Logo from "@/components/ui/logo";
import Sheet from "@/components/ui/sheet";
import SignOutButton from "@/components/ui/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { href: "/dashboard",     label: "Dashboard",     icon: LayoutDashboard },
  { href: "/fitness",       label: "Fitness",       icon: Activity },
  { href: "/habits",        label: "Habits",        icon: CheckSquare },
  { href: "/tasks",         label: "Tasks",         icon: ListTodo },
  { href: "/weekly",        label: "Weekly",        icon: BarChart2 },
  { href: "/journal",       label: "Journal",       icon: BookOpen },
  { href: "/meals",         label: "Meals",         icon: UtensilsCrossed },
  { href: "/chat",          label: "Chat",          icon: MessageSquare },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings",      label: "Settings",      icon: Settings },
];

// 4 primary tabs always visible; the rest live in the More sheet
const PRIMARY_HREFS = ["/dashboard", "/habits", "/tasks", "/chat"];
const MOBILE_PRIMARY = NAV_ITEMS.filter((item) => PRIMARY_HREFS.includes(item.href));
const MOBILE_MORE    = NAV_ITEMS.filter((item) => !PRIMARY_HREFS.includes(item.href));

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
  return pathname.startsWith(href);
}

export default function Nav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadError, setUnreadError] = useState(false);

  useEffect(() => {
    const demoEmail = process.env.NEXT_PUBLIC_DEMO_EMAIL;
    if (!demoEmail) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsDemo(user?.email === demoEmail);
    });
  }, []);

  useEffect(() => {
    const load = () => {
      fetch("/api/notifications/unread-count")
        .then((r) => {
          if (!r.ok) throw new Error("unread-count fetch failed");
          return r.json();
        })
        .then((d) => {
          setUnreadCount(d.count ?? 0);
          setUnreadError(false);
        })
        .catch(() => setUnreadError(true));
    };
    load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Is the current page one of the "More" pages? If so, highlight the More button.
  const moreIsActive = MOBILE_MORE.some((item) => isActive(pathname, item.href));

  return (
    <>
      {/* ── Desktop sidebar (≥ lg) ─────────────────────────────────── */}
      <nav
        className="hidden lg:flex flex-col fixed left-0 top-0 h-screen w-60 z-50"
        style={{
          background: "var(--color-bg)",
          borderRight: "1px solid var(--color-border)",
        }}
      >
        {/* Logo + theme toggle */}
        <div className="flex items-center gap-2.5 px-5 pt-6 pb-6">
          <Logo size={26} />
          <span
            className="font-heading text-sm font-semibold tracking-tight flex-1"
            style={{ color: "var(--color-text)" }}
          >
            Mr. Bridge
          </span>
          <ThemeToggle />
        </div>

        {/* Nav links */}
        <div className="flex flex-col gap-0.5 px-3 overflow-y-auto flex-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            const showBadge = href === "/notifications" && unreadCount > 0;
            const showErrorDot = href === "/notifications" && unreadError && unreadCount === 0;
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer"
                style={{
                  background: active ? "var(--color-primary-dim)" : "transparent",
                  color: active ? "var(--color-primary)" : "var(--color-text-muted)",
                }}
              >
                <span className="relative" style={{ flexShrink: 0 }}>
                  <Icon
                    size={18}
                    strokeWidth={active ? 2 : 1.5}
                    style={{ color: active ? "var(--color-primary)" : "var(--color-text-muted)" }}
                  />
                  {showBadge && (
                    <span
                      className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-white"
                      style={{
                        background: "var(--color-danger)",
                        minWidth: 14,
                        height: 14,
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "0 3px",
                        lineHeight: 1,
                      }}
                    >
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                  {showErrorDot && (
                    <span
                      title="Unread count unavailable"
                      aria-label="Unread count unavailable"
                      className="absolute -top-1 -right-1 rounded-full"
                      style={{
                        background: "var(--color-text-faint)",
                        width: 6,
                        height: 6,
                      }}
                    />
                  )}
                </span>
                {label}
              </Link>
            );
          })}
        </div>

        {/* Demo banner — desktop */}
        {isDemo && (
          <div
            className="mx-3 mb-4 px-3 py-2.5 rounded-lg text-xs overflow-hidden text-ellipsis whitespace-nowrap"
            style={{ background: "var(--color-primary-dim)", color: "var(--color-primary)" }}
            title="Demo account — changes reset nightly"
          >
            Demo account — changes reset nightly
          </div>
        )}

        {/* Sign out — desktop */}
        <div className="px-3 pb-4 mt-auto" style={{ borderTop: "1px solid var(--color-border)" }}>
          <SignOutButton />
        </div>
      </nav>

      {/* Demo banner — mobile (above tab bar). Hidden on /chat to avoid overlapping the composer. */}
      {isDemo && !pathname?.startsWith("/chat") && (
        <div
          className="lg:hidden fixed left-0 right-0 z-40 px-4 py-1.5 text-center text-xs"
          style={{ bottom: 56, background: "var(--color-primary-dim)", color: "var(--color-primary)" }}
        >
          Demo account — changes reset nightly
        </div>
      )}

      {/* ── Mobile bottom tab bar (< lg) ────────────────────────────── */}
      <nav
        className="flex lg:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: "var(--color-bg)",
          borderTop: "1px solid var(--color-border)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex w-full" style={{ height: 56 }}>
          {MOBILE_PRIMARY.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors duration-150"
                style={{
                  color: active ? "var(--color-primary)" : "var(--color-text-muted)",
                }}
              >
                <Icon size={18} strokeWidth={active ? 2 : 1.5} />
                <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, lineHeight: 1 }}>{label}</span>
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setShowMore(true)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors duration-150"
            style={{
              color: moreIsActive ? "var(--color-primary)" : "var(--color-text-muted)",
              background: "transparent",
              border: "none",
            }}
          >
            <MoreHorizontal size={18} strokeWidth={moreIsActive ? 2 : 1.5} />
            <span style={{ fontSize: 10, fontWeight: moreIsActive ? 600 : 400, lineHeight: 1 }}>More</span>
          </button>
        </div>
      </nav>

      {/* ── More bottom sheet ────────────────────────────────────────── */}
      <Sheet open={showMore} onOpenChange={setShowMore} title="More navigation" hideHeader>
        <>
          {/* Handle + header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                More
              </span>
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <button
                  onClick={() => setShowMore(false)}
                  style={{ color: "var(--color-text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="px-3 pb-4 grid grid-cols-2 gap-1">
              {MOBILE_MORE.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                const showBadge = href === "/notifications" && unreadCount > 0;
            const showErrorDot = href === "/notifications" && unreadError && unreadCount === 0;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setShowMore(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-150"
                    style={{
                      background: active ? "var(--color-primary-dim)" : "var(--color-surface-raised)",
                      color: active ? "var(--color-primary)" : "var(--color-text-muted)",
                    }}
                  >
                    <span className="relative" style={{ flexShrink: 0 }}>
                      <Icon
                        size={18}
                        strokeWidth={active ? 2 : 1.5}
                        style={{ color: active ? "var(--color-primary)" : "var(--color-text-muted)" }}
                      />
                      {showBadge && (
                        <span
                          className="absolute -top-1 -right-1 flex items-center justify-center rounded-full text-white"
                          style={{
                            background: "var(--color-danger)",
                            minWidth: 14,
                            height: 14,
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "0 3px",
                            lineHeight: 1,
                          }}
                        >
                          {unreadCount > 9 ? "9+" : unreadCount}
                        </span>
                      )}
                    </span>
                    <span className="text-sm font-medium">{label}</span>
                  </Link>
                );
              })}

              {/* Sign out — mobile More sheet */}
              <button
                onClick={async () => {
                  setShowMore(false);
                  const supabase = createClient();
                  await supabase.auth.signOut();
                  window.location.href = "/login";
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-150"
                style={{
                  background: "var(--color-surface-raised)",
                  color: "var(--color-text-muted)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <LogOut size={18} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                <span className="text-sm font-medium">Sign out</span>
              </button>
            </div>
        </>
      </Sheet>
    </>
  );
}
