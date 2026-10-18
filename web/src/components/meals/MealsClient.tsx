"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { UndoToastProvider, useUndoToast } from "@/components/ui/undo-toast";
import { sumMacroTotals, type MacroGoals, type MacroTotals } from "@/lib/nutrition/daily-macros";
import {
  ctaStyle,
  ghostStyle,
  type DailyMacroTotals,
  type MealRow,
  type RecipeRow,
} from "./meals-shared";
import { TodayTab } from "./TodayTab";
import { RecipesTab } from "./RecipesTab";
import { PlanTab } from "./PlanTab";
import { TrendsTab } from "./TrendsTab";
import { PastMeals } from "./PastMeals";

const FoodPhotoAnalyzer = dynamic(() => import("@/app/(protected)/meals/FoodPhotoAnalyzer"), {
  ssr: false,
});

// The row types live in meals-shared.ts since the split (#777); re-exported so the page keeps
// importing them from here.
export type { MealRow, RecipeRow, DailyMacroTotals };

// Moved to lib/nutrition/daily-macros.ts so the dashboard shares them; re-exported for the page.
export type { MacroGoals, MacroTotals };

interface Props {
  /**
   * Server-rendered content for the top of the Today tab — the kitchen and the week plan.
   * It lives inside the tab panel, under the tab bar, so the tabs are the first thing on the
   * page rather than sitting below a week of "Nothing planned" rows (#761).
   */
  todayLead?: React.ReactNode;
  todayMeals: MealRow[];
  pastMeals: MealRow[];
  recipes: RecipeRow[];
  macroGoals: MacroGoals;
  macroTotals: MacroTotals;
  macroTrends: DailyMacroTotals[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

type Tab = "today" | "recipes" | "scanner" | "plan" | "trends";

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "recipes", label: "Recipes" },
  { id: "scanner", label: "Scanner" },
  { id: "plan", label: "Plan" },
  { id: "trends", label: "Trends" },
];

// ─── Root component ───────────────────────────────────────────────────────────

export default function MealsClient(props: Props) {
  return (
    <UndoToastProvider>
      <MealsClientInner {...props} />
    </UndoToastProvider>
  );
}

function MealsClientInner({
  todayLead,
  todayMeals,
  pastMeals,
  recipes,
  macroGoals,
  macroTotals,
  macroTrends,
}: Props) {
  const router = useRouter();
  const toast = useUndoToast();
  const [tab, setTab] = useState<Tab>("today");
  const [unsavedScanCount, setUnsavedScanCount] = useState(0);
  const [pendingTab, setPendingTab] = useState<Tab | null>(null);

  // IDs of meals the user has tapped delete on but whose DELETE has not yet
  // been committed to the server (still inside the 5s undo window). Filtered
  // out of every rendered list and excluded from totals.
  const [pendingDeletes, setPendingDeletes] = useState<Set<string>>(() => new Set());
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const visibleTodayMeals = useMemo(
    () => todayMeals.filter((m) => !pendingDeletes.has(m.id)),
    [todayMeals, pendingDeletes],
  );
  const visiblePastMeals = useMemo(
    () => pastMeals.filter((m) => !pendingDeletes.has(m.id)),
    [pastMeals, pendingDeletes],
  );
  // SSR-computed `macroTotals` is the initial paint; once any row is pending
  // delete, recompute from the visible set so the UI updates immediately.
  const displayedMacroTotals = useMemo<MacroTotals>(
    () => (pendingDeletes.size === 0 ? macroTotals : sumMacroTotals(visibleTodayMeals)),
    [pendingDeletes.size, macroTotals, visibleTodayMeals],
  );

  const removeFromPending = useCallback((id: string) => {
    setPendingDeletes((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const commitDelete = useCallback(
    async (id: string) => {
      try {
        const res = await fetch("/api/meals/log", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (res.ok) {
          // router.refresh() will replace todayMeals/pastMeals from the server,
          // and the now-deleted row will be gone — clear the pending entry so
          // displayedMacroTotals falls back to the SSR-computed value.
          removeFromPending(id);
          router.refresh();
        } else {
          // Server kept the row — restore it to the visible list.
          removeFromPending(id);
        }
      } catch {
        removeFromPending(id);
      }
    },
    [router, removeFromPending],
  );

  const handleDelete = useCallback(
    (id: string) => {
      setPendingDeletes((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      const timer = setTimeout(() => {
        pendingTimers.current.delete(id);
        commitDelete(id);
      }, 5000);
      pendingTimers.current.set(id, timer);

      toast.show(
        "Meal deleted",
        () => {
          const t = pendingTimers.current.get(id);
          if (t) {
            clearTimeout(t);
            pendingTimers.current.delete(id);
          }
          removeFromPending(id);
        },
        5000,
      );
    },
    [toast, commitDelete, removeFromPending],
  );

  // On unmount (route change / tab close), flush any still-pending deletes so
  // the user doesn't have to babysit the toast for the delete to take effect.
  useEffect(() => {
    const timers = pendingTimers.current;
    return () => {
      for (const [id, timer] of timers) {
        clearTimeout(timer);
        // Fire-and-forget — the request leaves the browser even if the page
        // tears down before the response lands. Acceptable per #330.
        fetch("/api/meals/log", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
          keepalive: true,
        }).catch(() => {});
      }
      timers.clear();
    };
  }, []);

  function handleTabClick(id: Tab) {
    if (id !== "scanner" && tab === "scanner" && unsavedScanCount > 0) {
      setPendingTab(id);
      return;
    }
    setTab(id);
  }

  function confirmLeave() {
    setUnsavedScanCount(0);
    if (pendingTab) {
      setTab(pendingTab);
      setPendingTab(null);
    }
  }

  function cancelLeave() {
    setPendingTab(null);
  }

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-6)" }}>
      {/* Tab bar — pill style */}
      <div
        className="flex items-center"
        style={{
          gap: 2,
          padding: 2,
          borderRadius: "var(--r-2)",
          border: "1px solid var(--rule)",
          background: "transparent",
        }}
      >
        {TABS.map(({ id, label }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => handleTabClick(id)}
              className="flex-1"
              style={{
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--r-1)",
                fontSize: "var(--t-micro)",
                fontWeight: 500,
                background: active ? "var(--accent)" : "transparent",
                color: active ? "var(--color-text-on-cta)" : "var(--color-text-muted)",
                border: "none",
                cursor: "pointer",
                transition:
                  "background-color var(--motion-fast) var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Navigation guard banner */}
      {pendingTab && unsavedScanCount > 0 && (
        <div
          className="flex items-center"
          style={{
            gap: "var(--space-3)",
            padding: "var(--space-3) var(--space-4)",
            borderRadius: "var(--r-2)",
            background: "var(--warning-subtle)",
            border: "1px solid var(--color-warning)",
            fontSize: "var(--t-meta)",
            color: "var(--color-text)",
          }}
        >
          <span style={{ flex: 1 }}>
            You have {unsavedScanCount} unsaved scan{unsavedScanCount !== 1 ? "s" : ""}.
          </span>
          <button
            onClick={cancelLeave}
            className="transition-opacity active:opacity-70"
            style={{
              ...ctaStyle,
              fontSize: "var(--t-micro)",
              padding: "var(--space-1) var(--space-3)",
              whiteSpace: "nowrap",
            }}
          >
            Keep scanning
          </button>
          <button
            onClick={confirmLeave}
            className="transition-opacity active:opacity-70"
            style={{
              ...ghostStyle,
              fontSize: "var(--t-micro)",
              padding: "var(--space-1) var(--space-3)",
              whiteSpace: "nowrap",
            }}
          >
            Discard and leave
          </button>
        </div>
      )}

      {/* Tab panels */}
      {tab === "today" && todayLead && <div>{todayLead}</div>}
      {tab === "today" && (
        <TodayTab
          todayMeals={visibleTodayMeals}
          macroGoals={macroGoals}
          macroTotals={displayedMacroTotals}
          onDelete={handleDelete}
        />
      )}
      {tab === "recipes" && <RecipesTab recipes={recipes} />}
      {tab === "scanner" && (
        <FoodPhotoAnalyzer onUnsavedItems={(count) => setUnsavedScanCount(count)} />
      )}
      {tab === "plan" && <PlanTab macroTotals={displayedMacroTotals} macroGoals={macroGoals} />}
      {tab === "trends" && <TrendsTab macroTrends={macroTrends} macroGoals={macroGoals} />}

      {/* Past meals — always visible below the tabs */}
      {visiblePastMeals.length > 0 && (
        <PastMeals pastMeals={visiblePastMeals} onDelete={handleDelete} />
      )}
    </div>
  );
}
