"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";

/** Cookie holding the date the card was dismissed. Read server-side so a dismissed card never flashes. */
export const REENTRY_DISMISS_COOKIE = "mrb_reentry_dismissed";

interface Props {
  /** Today, YYYY-MM-DD — the dismissal lasts until the date changes. */
  today: string;
  /** Where "Log today's first meal" goes: the food section below when a meal is planned, else /meals. */
  logHref: string;
}

/**
 * Shown after a quiet stretch with no hand-entered logging (lib/reentry.ts).
 *
 * Forward-only by design — Jason, 2026-09-21: "I want today to be our reset and only looking
 * forward." So this card carries NO count of missed days, no streak, no "fill in what you
 * missed", and it never offers to backfill. It names one or two things to do today and gets out
 * of the way; dismissing it hides it until tomorrow.
 */
export default function ReentryCard({ today, logHref }: Props) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  function dismiss() {
    setHidden(true);
    try {
      // Two days covers a dismissal just before midnight; the value, not the expiry, is what
      // the page compares against today.
      document.cookie = `${REENTRY_DISMISS_COOKIE}=${today}; path=/; max-age=172800; samesite=lax`;
    } catch {
      // Cookies blocked: the card is hidden for this view and returns on the next load. Harmless.
    }
  }

  return (
    <section
      aria-label="Welcome back"
      style={{
        position: "relative",
        background: "var(--color-surface)",
        border: "1px solid var(--rule)",
        borderRadius: "var(--r-2)",
        padding: "var(--space-5)",
        paddingRight: "var(--space-7)",
      }}
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss for today"
        className="hover-bg-subtle"
        style={{
          position: "absolute",
          top: "var(--space-1)",
          right: "var(--space-1)",
          width: 44,
          height: 44,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          border: 0,
          borderRadius: "var(--r-2)",
          color: "var(--color-text-faint)",
          cursor: "pointer",
        }}
      >
        <X size={16} aria-hidden />
      </button>
      <p
        className="font-heading"
        style={{
          margin: 0,
          fontSize: "var(--t-h2)",
          fontWeight: 600,
          color: "var(--color-text)",
        }}
      >
        Welcome back. Start from today.
      </p>
      <div
        className="flex flex-wrap"
        style={{ gap: "var(--space-3)", marginTop: "var(--space-4)" }}
      >
        <Link href={logHref} className="dash-action dash-action-primary">
          Log today&apos;s first meal
        </Link>
        <Link href="/meals#week-plan" className="dash-action">
          Plan the next 2 days
        </Link>
      </div>
    </section>
  );
}
