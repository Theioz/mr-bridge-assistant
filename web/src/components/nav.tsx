"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageSquare, CheckSquare, Activity, ListTodo } from "lucide-react";

const tabs = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/habits", label: "Habits", icon: CheckSquare },
  { href: "/fitness", label: "Fitness", icon: Activity },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
];

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-800 z-50">
      <div className="max-w-2xl mx-auto flex">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
                active ? "text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2 : 1.5} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
