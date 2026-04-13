"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Activity,
  CheckSquare,
  UtensilsCrossed,
  MessageSquare,
  Settings,
  ListTodo,
  BookOpen,
  MoreHorizontal,
  X,
} from "lucide-react";
import Logo from "@/components/ui/logo";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard",  icon: LayoutDashboard },
  { href: "/fitness",   label: "Fitness",    icon: Activity },
  { href: "/habits",    label: "Habits",     icon: CheckSquare },
  { href: "/tasks",     label: "Tasks",      icon: ListTodo },
  { href: "/journal",   label: "Journal",    icon: BookOpen },
  { href: "/meals",     label: "Meals",      icon: UtensilsCrossed },
  { href: "/chat",      label: "Chat",       icon: MessageSquare },
  { href: "/settings",  label: "Settings",   icon: Settings },
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
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 pt-6 pb-6">
          <Logo size={26} />
          <span
            className="font-heading text-sm font-semibold tracking-tight"
            style={{ color: "var(--color-text)" }}
          >
            Mr. Bridge
          </span>
        </div>

        {/* Nav links */}
        <div className="flex flex-col gap-0.5 px-3 overflow-y-auto flex-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
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
                <Icon
                  size={18}
                  strokeWidth={active ? 2 : 1.5}
                  style={{ color: active ? "var(--color-primary)" : "var(--color-text-muted)", flexShrink: 0 }}
                />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

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
      {showMore && (
        <>
          {/* Backdrop */}
          <div
            className="lg:hidden fixed inset-0 z-[60]"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => setShowMore(false)}
          />

          {/* Sheet */}
          <div
            className="lg:hidden fixed left-0 right-0 bottom-0 z-[70] rounded-t-2xl"
            style={{
              background: "var(--color-surface)",
              borderTop: "1px solid var(--color-border)",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            {/* Handle + header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3">
              <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                More
              </span>
              <button
                onClick={() => setShowMore(false)}
                style={{ color: "var(--color-text-muted)", background: "transparent", border: "none", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-3 pb-4 grid grid-cols-2 gap-1">
              {MOBILE_MORE.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
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
                    <Icon
                      size={18}
                      strokeWidth={active ? 2 : 1.5}
                      style={{ color: active ? "var(--color-primary)" : "var(--color-text-muted)", flexShrink: 0 }}
                    />
                    <span className="text-sm font-medium">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </>
  );
}
