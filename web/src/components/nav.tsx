"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Activity,
  CheckSquare,
  UtensilsCrossed,
  MessageSquare,
  Settings,
  ListTodo,
  BookOpen,
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

// Mobile shows only the 5 highest-frequency actions (≤5 is the tab bar guideline)
const MOBILE_NAV_ITEMS = NAV_ITEMS.filter((item) =>
  ["/dashboard", "/habits", "/tasks", "/chat", "/journal"].includes(item.href)
);

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
  return pathname.startsWith(href);
}

export default function Nav() {
  const pathname = usePathname();

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

      {/* ── Mobile bottom tab bar (< lg) — 5 items max ─────────────── */}
      <nav
        className="flex lg:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{
          height: 56,
          background: "var(--color-bg)",
          borderTop: "1px solid var(--color-border)",
        }}
      >
        {MOBILE_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors duration-150"
              style={{
                minHeight: 44,
                color: active ? "var(--color-primary)" : "var(--color-text-muted)",
              }}
            >
              <Icon size={18} strokeWidth={active ? 2 : 1.5} />
              <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, lineHeight: 1 }}>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
