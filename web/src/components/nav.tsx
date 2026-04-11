"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageSquare, CheckSquare, Activity, ListTodo, BookOpen } from "lucide-react";
import Logo from "@/components/ui/logo";

const tabs = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/habits", label: "Habits", icon: CheckSquare },
  { href: "/fitness", label: "Fitness", icon: Activity },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/journal", label: "Journal", icon: BookOpen },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="fixed left-0 top-0 h-screen w-12 lg:w-48 bg-neutral-900 border-r border-neutral-800 z-50 flex flex-col">
      {/* Logo */}
      <div className="flex items-center justify-center lg:justify-start px-0 lg:px-4 pt-6 pb-6">
        <Logo size={28} />
        <span className="hidden lg:block ml-2.5 text-sm font-semibold text-neutral-100 tracking-tight">
          Mr. Bridge
        </span>
      </div>

      {/* Nav items */}
      <div className="flex flex-col gap-1 px-1.5 lg:px-2">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={`group relative flex items-center justify-center lg:justify-start gap-3 px-1.5 lg:px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "text-blue-400 bg-blue-500/10 border-l-2 border-blue-500 rounded-l-none"
                  : "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/60 border-l-2 border-transparent rounded-l-none"
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2 : 1.5} className="shrink-0" />
              <span className="hidden lg:block font-medium">{label}</span>

              {/* Tooltip for icon-only rail */}
              <span className="lg:hidden absolute left-full ml-2 px-2 py-1 text-xs text-neutral-100 bg-neutral-800 border border-neutral-700 rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
