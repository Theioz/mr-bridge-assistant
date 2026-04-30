"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, type CSSProperties } from "react";
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
  CalendarDays,
  Bell,
  Library,
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
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/fitness", label: "Fitness", icon: Activity },
  { href: "/habits", label: "Habits", icon: CheckSquare },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/weekly", label: "Weekly", icon: BarChart2 },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/backlog", label: "Backlog", icon: Library },
  { href: "/meals", label: "Meals", icon: UtensilsCrossed },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

// 4 primary tabs always visible; the rest live in the More sheet
const PRIMARY_HREFS = ["/dashboard", "/habits", "/tasks", "/chat"];
const MOBILE_PRIMARY = NAV_ITEMS.filter((item) => PRIMARY_HREFS.includes(item.href));
const MOBILE_MORE = NAV_ITEMS.filter((item) => !PRIMARY_HREFS.includes(item.href));

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
  return pathname.startsWith(href);
}

const navTransition = `color var(--motion-fast) var(--ease-out-quart), background-color var(--motion-fast) var(--ease-out-quart)`;

export default function Nav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadError, setUnreadError] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      const demoEmail = process.env.NEXT_PUBLIC_DEMO_EMAIL;
      if (demoEmail) setIsDemo(user?.email === demoEmail);
      setIsAdmin(user?.user_metadata?.is_admin === true);
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
      {/* Transparent surface — ambient watercolor + grain pass through;
          a single hairline rule separates the rail from the canvas. */}
      <nav
        className="hidden lg:flex flex-col fixed left-0 top-0 h-screen w-60 z-50 print:hidden"
        style={{ borderRight: "1px solid var(--rule-soft)" }}
      >
        {/* Brand + theme toggle */}
        <div
          className="flex items-center"
          style={{
            gap: "var(--space-3)",
            padding: "var(--space-6) var(--space-5) var(--space-6)",
          }}
        >
          <Logo size={26} />
          <span
            className="font-heading flex-1"
            style={{
              color: "var(--color-text)",
              fontSize: "var(--t-h2)",
              fontWeight: 600,
              letterSpacing: "-0.01em",
            }}
          >
            Mr. Bridge
          </span>
          <ThemeToggle />
        </div>

        {/* Nav links */}
        <div
          className="flex flex-col overflow-y-auto flex-1"
          style={{ gap: "var(--space-1)", padding: "0 var(--space-3)" }}
        >
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            const showBadge = href === "/notifications" && unreadCount > 0;
            const showErrorDot = href === "/notifications" && unreadError && unreadCount === 0;
            const itemStyle: CSSProperties = {
              position: "relative",
              minHeight: 44,
              padding: "var(--space-2) var(--space-3) var(--space-2) calc(var(--space-3) + 2px)",
              borderRadius: "var(--r-2)",
              fontSize: "var(--t-meta)",
              fontWeight: active ? 500 : 400,
              color: active ? "var(--accent-text)" : "var(--color-text-muted)",
              transition: navTransition,
            };
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex items-center gap-3 cursor-pointer hover-bg-subtle hover-text-brighten"
                style={itemStyle}
              >
                {/* Active rail — 2px wide, full row height, restrained accent cue */}
                {active && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 6,
                      bottom: 6,
                      width: 2,
                      borderRadius: 1,
                      background: "var(--accent)",
                    }}
                  />
                )}
                <span className="relative" style={{ flexShrink: 0, lineHeight: 0 }}>
                  <Icon
                    size={18}
                    strokeWidth={active ? 2 : 1.5}
                    style={{ color: active ? "var(--accent-text)" : "currentColor" }}
                  />
                  {showBadge && (
                    <span
                      className="absolute -top-1 -right-1 flex items-center justify-center rounded-full"
                      style={{
                        background: "var(--accent)",
                        color: "var(--color-text-on-cta)",
                        minWidth: 14,
                        height: 14,
                        fontSize: 9,
                        fontWeight: 700,
                        padding: "0 3px",
                        lineHeight: 1,
                        fontVariantNumeric: "tabular-nums",
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
            className="overflow-hidden text-ellipsis whitespace-nowrap"
            style={{
              margin: "0 var(--space-3) var(--space-4)",
              padding: "var(--space-2) var(--space-3)",
              borderRadius: "var(--r-2)",
              background: "var(--warning-subtle)",
              color: "var(--accent)",
              fontSize: "var(--t-micro)",
              letterSpacing: "0.01em",
            }}
            title="Demo account — changes reset nightly"
          >
            Demo account — changes reset nightly
          </div>
        )}

        {/* Admin + sign-out — desktop, pinned to bottom */}
        <div style={{ marginTop: "auto" }}>
          {isAdmin && (
            <div style={{ padding: "0 var(--space-3) var(--space-1)" }}>
              <Link
                href="/admin"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-3)",
                  padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--r-2)",
                  fontSize: "var(--t-meta)",
                  color: "var(--color-text-muted)",
                  textDecoration: "none",
                  transition: navTransition,
                }}
              >
                Admin
              </Link>
            </div>
          )}
          <div
            style={{
              padding: "var(--space-3) var(--space-3) var(--space-4)",
              borderTop: "1px solid var(--rule-soft)",
            }}
          >
            <SignOutButton />
          </div>
        </div>
      </nav>

      {/* Demo banner — mobile (above tab bar). Hidden on /chat to avoid overlapping the composer. */}
      {isDemo && !pathname?.startsWith("/chat") && (
        <div
          className="lg:hidden fixed left-0 right-0 z-40 text-center overflow-hidden text-ellipsis whitespace-nowrap print:hidden"
          style={{
            bottom: 56,
            padding: "var(--space-1) var(--space-4)",
            background: "var(--warning-subtle)",
            color: "var(--accent)",
            fontSize: "var(--t-micro)",
          }}
        >
          Demo account — changes reset nightly
        </div>
      )}

      {/* ── Mobile bottom tab bar (< lg) ────────────────────────────── */}
      {/* Opaque — the bottom bar overlays scrolling content, so the canvas
          color anchors it. Hairline top rule, no shadow. */}
      <nav
        className="flex lg:hidden fixed bottom-0 left-0 right-0 z-50 print:hidden"
        style={{
          background: "var(--color-bg)",
          borderTop: "1px solid var(--rule-soft)",
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
                aria-current={active ? "page" : undefined}
                className="flex-1 flex flex-col items-center justify-center cursor-pointer"
                style={{
                  gap: 2,
                  color: active ? "var(--accent-text)" : "var(--color-text-muted)",
                  transition: navTransition,
                  minHeight: 44,
                }}
              >
                <Icon size={18} strokeWidth={active ? 2 : 1.5} />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: active ? 600 : 400,
                    lineHeight: 1,
                    letterSpacing: "0.02em",
                  }}
                >
                  {label}
                </span>
              </Link>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setShowMore(true)}
            aria-current={moreIsActive ? "page" : undefined}
            className="flex-1 flex flex-col items-center justify-center cursor-pointer"
            style={{
              gap: 2,
              color: moreIsActive ? "var(--accent-text)" : "var(--color-text-muted)",
              background: "transparent",
              border: "none",
              transition: navTransition,
              minHeight: 44,
            }}
          >
            <MoreHorizontal size={18} strokeWidth={moreIsActive ? 2 : 1.5} />
            <span
              style={{
                fontSize: 10,
                fontWeight: moreIsActive ? 600 : 400,
                lineHeight: 1,
                letterSpacing: "0.02em",
              }}
            >
              More
            </span>
          </button>
        </div>
      </nav>

      {/* ── More bottom sheet ────────────────────────────────────────── */}
      <Sheet open={showMore} onOpenChange={setShowMore} title="More navigation" hideHeader>
        <>
          {/* Header — flat, hairline rule below */}
          <div
            className="flex items-center justify-between"
            style={{
              padding: "var(--space-4) var(--space-5) var(--space-3)",
              borderBottom: "1px solid var(--rule-soft)",
            }}
          >
            <span
              className="font-heading"
              style={{
                color: "var(--color-text)",
                fontSize: "var(--t-h2)",
                fontWeight: 600,
                letterSpacing: "-0.01em",
              }}
            >
              More
            </span>
            <div className="flex items-center" style={{ gap: "var(--space-2)" }}>
              <ThemeToggle />
              <button
                onClick={() => setShowMore(false)}
                aria-label="Close"
                className="flex items-center justify-center cursor-pointer"
                style={{
                  color: "var(--color-text-muted)",
                  background: "transparent",
                  border: "none",
                  minWidth: 44,
                  minHeight: 44,
                  borderRadius: "var(--r-2)",
                  transition: navTransition,
                }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Items — flat list, hairline dividers, accent for active */}
          <div style={{ padding: "var(--space-2) 0 var(--space-4)" }}>
            {MOBILE_MORE.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              const showBadge = href === "/notifications" && unreadCount > 0;
              const showErrorDot = href === "/notifications" && unreadError && unreadCount === 0;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setShowMore(false)}
                  aria-current={active ? "page" : undefined}
                  className="flex items-center hover-bg-subtle"
                  style={{
                    gap: "var(--space-3)",
                    padding: "var(--space-3) var(--space-5)",
                    minHeight: 48,
                    color: active ? "var(--accent-text)" : "var(--color-text)",
                    fontSize: "var(--t-meta)",
                    fontWeight: active ? 500 : 400,
                    transition: navTransition,
                    borderTop: "1px solid var(--rule-soft)",
                  }}
                >
                  <span className="relative" style={{ flexShrink: 0, lineHeight: 0 }}>
                    <Icon
                      size={18}
                      strokeWidth={active ? 2 : 1.5}
                      style={{ color: active ? "var(--accent-text)" : "var(--color-text-muted)" }}
                    />
                    {showBadge && (
                      <span
                        className="absolute -top-1 -right-1 flex items-center justify-center rounded-full"
                        style={{
                          background: "var(--accent)",
                          color: "var(--color-text-on-cta)",
                          minWidth: 14,
                          height: 14,
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "0 3px",
                          lineHeight: 1,
                          fontVariantNumeric: "tabular-nums",
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

            {/* Admin — mobile More sheet, owner only */}
            {isAdmin && (
              <Link
                href="/admin"
                onClick={() => setShowMore(false)}
                className="flex items-center w-full hover-bg-subtle"
                style={{
                  gap: "var(--space-3)",
                  padding: "var(--space-3) var(--space-5)",
                  minHeight: 48,
                  color: "var(--color-text-muted)",
                  fontSize: "var(--t-meta)",
                  borderTop: "1px solid var(--rule-soft)",
                  textDecoration: "none",
                  transition: navTransition,
                }}
              >
                Admin
              </Link>
            )}

            {/* Sign out — mobile More sheet */}
            <button
              onClick={async () => {
                setShowMore(false);
                const supabase = createClient();
                await supabase.auth.signOut();
                window.location.href = "/login";
              }}
              className="flex items-center w-full hover-bg-subtle"
              style={{
                gap: "var(--space-3)",
                padding: "var(--space-3) var(--space-5)",
                minHeight: 48,
                color: "var(--color-text-muted)",
                fontSize: "var(--t-meta)",
                background: "transparent",
                border: "none",
                borderTop: "1px solid var(--rule-soft)",
                cursor: "pointer",
                transition: navTransition,
              }}
            >
              <LogOut size={18} strokeWidth={1.5} style={{ flexShrink: 0 }} />
              Sign out
            </button>
          </div>
        </>
      </Sheet>
    </>
  );
}
