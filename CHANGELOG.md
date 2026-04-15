# Changelog

All notable changes to Mr. Bridge are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

---

## [Unreleased]

### Fixed (card-lift missed tiles — follow-up to #240)
- Applied `transition-all duration-200 card-lift` to tile wrappers the first sweep missed (Link-wrapped tile, empty-state branches, weekly `Card` helper, fitness chart panels that weren't in the first scan):
  - [dashboard/tasks-summary.tsx](web/src/components/dashboard/tasks-summary.tsx) — Active Tasks tile (wrapper is `<Link>`, not `<div>`)
  - [fitness/workout-freq-chart.tsx](web/src/components/fitness/workout-freq-chart.tsx), [fitness/active-cal-chart.tsx](web/src/components/fitness/active-cal-chart.tsx), [fitness/active-cal-goal-chart.tsx](web/src/components/fitness/active-cal-goal-chart.tsx), [fitness/body-fat-goal-chart.tsx](web/src/components/fitness/body-fat-goal-chart.tsx)
  - [habits/heatmap.tsx](web/src/components/habits/heatmap.tsx), [habits/streak-chart.tsx](web/src/components/habits/streak-chart.tsx), [habits/radial-completion.tsx](web/src/components/habits/radial-completion.tsx) — both empty-state and data-state wrappers
  - [(protected)/weekly/page.tsx](web/src/app/(protected)/weekly/page.tsx) — shared `Card` component used by every tile on the weekly view

### Changed (card-lift applied to canonical tile wrappers — issue #240)
- Follow-up to #229 / #238. `.card-lift` was defined but only applied to `MetricCard`, which is an orphan (defined, never rendered) — so the lift was invisible on the real dashboard. Applied `transition-all duration-200 card-lift` to 13 canonical widget-shell wrappers:
  - **dashboard/** — [recent-workouts-table.tsx](web/src/components/dashboard/recent-workouts-table.tsx), [schedule-today.tsx](web/src/components/dashboard/schedule-today.tsx), [habits-checkin.tsx](web/src/components/dashboard/habits-checkin.tsx), [trends-card.tsx](web/src/components/dashboard/trends-card.tsx), [sports-card.tsx](web/src/components/dashboard/sports-card.tsx), [watchlist-widget.tsx](web/src/components/dashboard/watchlist-widget.tsx), [today-scores-strip.tsx](web/src/components/dashboard/today-scores-strip.tsx), [health-breakdown.tsx](web/src/components/dashboard/health-breakdown.tsx)
  - **fitness/** — [workout-history-table.tsx](web/src/components/fitness/workout-history-table.tsx), [body-comp-dual-chart.tsx](web/src/components/fitness/body-comp-dual-chart.tsx), [weight-goal-chart.tsx](web/src/components/fitness/weight-goal-chart.tsx), [weekly-workout-plan.tsx](web/src/components/fitness/weekly-workout-plan.tsx)
  - **meals/** — [MacroSummaryCard.tsx](web/src/components/meals/MacroSummaryCard.tsx)
- List rows, chart sub-panels inside a tile, and chat/settings/modal panels were intentionally excluded — lifting them would re-introduce dense-data jitter.

### Changed (card hover lift + tab focus ring — issue #229)
- **`web/src/app/globals.css`** — added `.card-lift` utility (`hover: translateY(-2px) + box-shadow: var(--shadow-lg)`), pairs with `transition-all duration-200` per MASTER.md card spec. Uses `transform` so no layout shift.
- **`web/src/components/ui/metric-card.tsx`** (H6) — swapped `transition-colors` → `transition-all`, added `.card-lift` so metric cards lift on hover alongside the existing border-color change.
- **`web/src/components/dashboard/health-breakdown.tsx`** (M13) — `TabPills` now render an explicit 2px primary-colored `focus-visible` outline with 2px offset; global `:focus-visible` was too subtle on the dense pill row.

### Changed (hover-handler sweep → CSS / Tailwind — issue #227)
- **`web/src/app/globals.css`** — added hover utility classes (`.hover-text-brighten`, `.hover-text-danger`, `.hover-text-muted`, `.hover-bg-subtle`, `.hover-bg-border`, `.hover-bg-raised`, `.hover-border-strong`) that override inline-style base colors via `!important` on `:hover`. Paired with `transition-colors` / `transition-opacity` they deliver the 150ms MASTER.md spec.
- **Mechanical sweep across 10 components** — removed `onMouseEnter`/`onMouseLeave` inline-style writes in [login/page.tsx](web/src/app/login/page.tsx), [chat/chat-interface.tsx](web/src/components/chat/chat-interface.tsx), [chat/chat-page-client.tsx](web/src/components/chat/chat-page-client.tsx), [chat/session-sidebar.tsx](web/src/components/chat/session-sidebar.tsx), [ui/sign-out-button.tsx](web/src/components/ui/sign-out-button.tsx), [theme-toggle.tsx](web/src/components/theme-toggle.tsx), [dashboard/habits-checkin.tsx](web/src/components/dashboard/habits-checkin.tsx), [ui/metric-card.tsx](web/src/components/ui/metric-card.tsx), [dashboard/sync-button.tsx](web/src/components/dashboard/sync-button.tsx), [dashboard/recent-workouts-table.tsx](web/src/components/dashboard/recent-workouts-table.tsx). Buttons with opacity hovers use native Tailwind `hover:opacity-85` / `hover:opacity-90`. Remaining `onMouseEnter`/`onMouseLeave` callsites (message-bubble reveal, slash-command-menu active index, heatmap tooltip) are state-driven and kept.
- **`web/src/components/chat/session-sidebar.tsx`** — `SessionRow` dropped `hoveredId` state in favor of `group/row` + `group-hover/row:` utilities; delete button now always rendered but `opacity-0 group-hover/row:opacity-100` (keyboard-focus-visible also reveals it).
- **`web/src/components/theme-toggle.tsx`** (M2) — removed the `mounted` gate on `aria-label` / `title`. SSR label is now `Theme: System. Click to change.` (the correct default before `next-themes` resolves), not the generic "Theme toggle".

### Fixed (mobile chat keyboard / composer / FAB overlap — issue #226)
- **`web/src/lib/use-keyboard-open.ts`** (new) — `useKeyboardOpen()` hook subscribes to `window.visualViewport` and returns `{ isKeyboardOpen, viewportHeight }`. Heuristic: keyboard open when `vv.height < window.innerHeight - 100`. SSR-safe.
- **`web/src/components/chat/chat-page-client.tsx`** — mobile new-chat FAB hides while the keyboard is open so it no longer floats above the iOS keyboard.
- **`web/src/components/chat/chat-interface.tsx`** — composer `maxHeight` (textarea auto-resize cap and inline style) clamps to `min(200, viewportHeight * 0.3)` while the keyboard is open, preserving room for message-history scroll. Load-older-messages button shows `Loader2 + "Loading…"` instead of icon-only.
- **`web/src/components/nav.tsx`** — demo banner is hidden on `/chat` routes (was overlapping chat messages on short threads).
- **`web/src/app/globals.css`** — added `.scroll-fade-mask` utility (bottom 16px linear-gradient mask) for truncated scroll regions.
- **`web/src/components/dashboard/tasks-summary.tsx`, `web/src/components/dashboard/habits-checkin.tsx`** — apply `scroll-fade-mask` so users see overflow indication on capped lists.

### Added (habit `icon_key` column + picker — issue #225)
- **`supabase/migrations/20260415000003_habit_registry_icon_key.sql`** — adds nullable `icon_key TEXT` to `habit_registry` and backfills existing rows by mirroring the `getHabitIcon` derivation in SQL (category match → name keyword → `target`). **Apply manually in Supabase SQL editor before deploying.**
- **`web/src/components/habits/habit-icon-picker.tsx`** (new) — radiogroup of 14 Lucide icons (Target, Dumbbell, HeartPulse, Moon, Droplet, Footprints, BookOpen, Code2, GraduationCap, Brain, NotebookPen, Sparkles, Smile, Ban). Inline in the add form ([habit-today-section.tsx](web/src/components/habits/habit-today-section.tsx)) and the edit form ([habit-toggle.tsx](web/src/components/habits/habit-toggle.tsx)).
- **`web/src/lib/habit-icons.ts`** — `getHabitIcon` now prefers `habit.icon_key` when it matches a known key; otherwise falls through to category/name derivation. Exposes `HABIT_ICON_OPTIONS` registry consumed by the picker.
- **`web/src/app/(protected)/habits/page.tsx`** — `addHabit` / `updateHabit` server actions accept and persist `iconKey`. Dashboard + weekly SSR queries select `icon_key`; Pick types updated.

### Changed (habit emoji-as-icon → Lucide — issue #225)
- **`web/src/lib/habit-icons.ts`** (new) — `getHabitIcon(habit)` derives a Lucide icon from `habit.category` (Dumbbell/HeartPulse/Sparkles/GraduationCap/Moon/Brain) with a name-keyword fallback (sleep→Moon, water→Droplet, read→BookOpen, code→Code2, step→Footprints, workout→Dumbbell, journal→NotebookPen, alcohol→Ban, meditate→Brain, etc.) and `Target` as the final default. No schema migration — derivation only.
- **`web/src/components/dashboard/habits-checkin.tsx`, `web/src/components/habits/habit-toggle.tsx`, `web/src/app/(protected)/weekly/page.tsx`** — habit row visual is now the derived Lucide icon. `habit-toggle` retains `habit.emoji` as a small `aria-hidden` accent after the icon. `habits-checkin` (compact dashboard) drops emoji entirely. Dashboard + weekly SSR queries now select `category`.
- **`web/src/components/habits/habit-toggle.tsx`, `web/src/components/habits/habit-today-section.tsx`** — emoji-picker placeholder is a Lucide `Smile` icon instead of the literal `😀` glyph; the picker itself is unchanged (user can still attach an emoji as sentiment metadata).

### Changed (light-mode color tokenization — issue #224)
- **`web/src/app/globals.css`, `design-system/mr-bridge/MASTER.md`** — added 12 new theme tokens (`--color-text-on-cta`, `--overlay-scrim`, `--hover-subtle`, `--warning-subtle{,-strong}`, `--color-danger-subtle`, `--color-positive-subtle{,-strong}`, `--color-cta-subtle{,-strong}`, `--color-skeleton`, `--color-positive-{light,lighter,lightest}`) with per-theme values. Eliminates ~50 hardcoded hex/rgba sites that broke light mode (invisible white-on-white text on CTAs, vanished overlays, ghost skeletons).
- **Mechanical sweep across ~25 components** — every `"#fff"` literal swapped to `var(--color-text-on-cta)`; rgba overlays/hovers/warning/danger/positive tints swapped to the new tokens. Light-mode-breaking `color-mix()` callsites in [login/page.tsx](web/src/app/login/page.tsx) and [upcoming-birthday.tsx](web/src/components/dashboard/upcoming-birthday.tsx) replaced with the new subtle tokens (Safari <16.4 fallback no longer needed).
- **`web/src/components/habits/heatmap.tsx`** — completion gradient uses `--color-positive{,-light,-lighter,-lightest}` instead of hardcoded green hexes.
- **`web/src/components/dashboard/health-breakdown.tsx`** — `scorePanelStyle()` now composes `--color-positive-subtle` / `--warning-subtle` / `--color-danger-subtle` instead of templated rgba strings.
- **`web/src/app/globals.css` `.skeleton`** — gradient now uses the higher-contrast `--color-skeleton` instead of `--color-surface` (fixes ~1.1:1 light-mode invisible shimmer).

### Added (re-log past meals — issue #220)
- **`web/src/components/meals/MealsClient.tsx`** — "Log again" `RefreshCw` icon button on each Today-tab meal row; tap pre-fills the quick-log form (dish name + macros + meal type), scrolls the form into view, and focuses the Log button. Save path unchanged — creates a new `meal_log` row with today's date; the original row is never mutated.
- **Recent meals section** on the Today tab — renders up to 10 unique dishes from the past 7 days (pulled from existing SSR `pastMeals` prop), deduped by a normalized dish name (lowercase, punctuation stripped). Section is hidden entirely when there's no history (brand-new account).
- **Estimate macros button + Ingredients textarea** in the quick-log form — collapsible ephemeral textarea (not persisted) for the user to type a full ingredient list OR just a modification (e.g. "added 4oz chicken"). Hits `/api/meals/estimate-macros`, which was extended to accept `dish_name` + `current_macros` as context; when both are present it treats the textarea as additions/modifications to the base dish rather than a full replacement. Macro fields + meal type are overwritten with the AI estimate.

### Added (UX polish bundle — issue #217)
- **`web/src/app/error.tsx`** — top-level error boundary with friendly copy, Retry button calling Next.js `reset()`.
- **`web/src/app/(protected)/error.tsx`** — protected route error boundary with Retry + "Dashboard" fallback link.
- **`web/src/app/login/layout.tsx`** — server-component wrapper so the (client) login page can still export `metadata`.
- **Per-page metadata** — `export const metadata` added to dashboard, chat, settings, fitness, habits, journal, meals, notifications, tasks, weekly, and login. Root `layout.tsx` now defines a `title.template` of `"%s · Mr. Bridge"`, so each tab shows a unique browser title.
- **Skip link** in `web/src/app/(protected)/layout.tsx` — visible on focus, jumps past the sidebar/nav to `#main-content`.

### Changed (issue #217)
- **`web/src/app/login/page.tsx`** — password visibility toggle (`Eye`/`EyeOff` with `aria-pressed`, `aria-label`); `aria-describedby` on email + password inputs linked to the error `<p>`; submit button now carries `aria-disabled` and a contextual `title` ("Enter a valid email" / "Enter your password") when disabled.
- **`web/src/components/chat/message-bubble.tsx`** — timestamp tooltip (`title=`) now includes the full date, not just the time, so long-scroll context is visible on hover.
- **`web/src/components/chat/chat-page-client.tsx`** — session-switch now shows a 3-row shimmer skeleton (respecting `role="status"`) instead of a static "Loading…" line; archive undo window extended from 5s → 10s.
- **`web/src/components/chat/chat-interface.tsx`** — typing dots gated behind `motion-safe:animate-bounce` with a `motion-reduce:opacity-60` fallback; the container is now `role="status" aria-label="Assistant is typing"`.
- **`web/src/components/chat/session-sheet.tsx`** — archive now opens a confirmation dialog (Radix Dialog) instead of firing immediately; preview of the chat is shown in the confirmation body; Cancel / Archive actions.

### Added (dashboard reorder + empty/error states — issue #216)
- **`web/src/components/dashboard/empty-state.tsx`** — shared `<EmptyState icon children actionHref? actionLabel? variant?>` component. Empty variant uses `--color-text-faint`; error variant swaps icon for `AlertTriangle` and uses `--color-danger` with `role="status"`.

### Changed (issue #216)
- **`web/src/app/(protected)/dashboard/page.tsx`** — Tasks now render before Habits in the 2-column grid, matching the actionable-today cluster for glance-first triage.
- **`web/src/components/dashboard/dashboard-header.tsx`** — weather failure now surfaces an `AlertTriangle` + "Weather unavailable" line instead of silently hiding the block.
- **`web/src/components/nav.tsx`** — unread-count fetch errors now surface a small muted dot on the Notifications icon (with `title`/`aria-label`) instead of being silently swallowed.
- **`web/src/components/dashboard/tasks-summary.tsx`, `habits-checkin.tsx`, `schedule-today.tsx`, `watchlist-widget.tsx`, `sports-card.tsx`** — empty states standardized on the `<EmptyState>` icon + text pattern; watchlist/sports/habits include a settings action link; schedule-today's error branch is now the error variant.

### Added (a11y: sheet focus traps — issue #215)
- **`web/src/components/ui/sheet.tsx`** — thin `<Sheet>` wrapper over `@radix-ui/react-dialog` preserving the existing bottom-sheet visuals (rounded top, safe-area inset, backdrop tint). Provides focus trap, Escape dismiss, focus restore, `role="dialog"`, and `aria-modal`. Accessible title rendered via `Dialog.Title` (sr-only; each sheet keeps its own visible header).
- **`web/package.json`** — adds `@radix-ui/react-dialog` dependency.

### Changed (issue #215)
- **`web/src/components/nav.tsx`** — More sheet migrated to `<Sheet>`. Keyboard users can now Tab within the open sheet, Escape dismisses, and focus returns to the More button on close.
- **`web/src/components/chat/session-sheet.tsx`** — Chat history sheet migrated to `<Sheet>` with the same a11y benefits; backdrop click still dismisses via `onOpenChange`.

### Added (dark/light theme toggle — issue #214)
- **`web/src/components/theme-provider.tsx`** — wraps `next-themes` `ThemeProvider` with `attribute="data-theme"` and `enableSystem`.
- **`web/src/components/theme-toggle.tsx`** — header icon button (System/Light/Dark cycle), Lucide `Sun` / `Moon` / `Monitor`. Rendered in the desktop sidebar header and the mobile More sheet header.
- **`web/src/components/settings/appearance-settings.tsx`** — Settings "Appearance" radio group (System / Light / Dark) synced bidirectionally with the header toggle via `useTheme()`.
- **`web/src/lib/theme.ts`** — `getServerThemePreference()` reads `profile.theme_preference` (K/V key) so SSR emits the correct `data-theme` on `<html>` and avoids FOUC.
- **`web/src/lib/theme-actions.ts`** — `setThemePreference()` server action that upserts (or deletes, for `system`) the profile row.
- **`web/src/lib/chart-colors.ts`** — `useChartColors()` hook reads CSS variables at runtime via `getComputedStyle()` so Recharts responds to theme switches.
- **Audit deliverable** at `.claude/plans/snappy-twirling-cookie.md`.

### Changed (issue #214)
- **`web/src/app/globals.css`** — dark tokens aligned to MASTER.md (`--color-primary` now `#3B82F6`, not `#6366F1`); added `:root[data-theme="light"]` with MASTER.md light column values; added global `:focus-visible` outline rule; `html { color-scheme: dark light; }`.
- **Color migration** — replaced ~200 hardcoded hex values and ~30 Tailwind `neutral-*`/`rose-*`/`blue-*` utilities with CSS vars across dashboard + fitness + habits + chat + nav + settings + login. Chart components now consume `useChartColors()`.
- **`web/src/components/dashboard/dashboard-header.tsx`** — replaced emoji WMO weather map with Lucide icons (`Sun`, `CloudSun`, `CloudRain`, etc.).
- **`design-system/mr-bridge/MASTER.md`** — §Typography now documents DM Sans + Inter (intentional deviation from original Fira spec).

### Added (ui-ux-pro-max skill + design system — prep for issue #10)
- **`.claude/skills/ui-ux-pro-max/`** — installed via `uipro init --ai claude` (uipro-cli@2.2.3). Provides design intelligence (67 styles, 96 palettes, 57 font pairings, 13 stacks) with a CLI for generating design systems and running domain searches (style, ux, typography, color, chart, stack-specific guidelines).
- **`design-system/mr-bridge/MASTER.md`** — persisted design system: Dark Mode (OLED) style, Fira Code + Fira Sans typography, blue+amber palette with dark/light tokens, spacing/shadow scales, component specs, anti-patterns, pre-delivery checklist. Page Pattern hand-edited to "Sidebar + Main (Chat/Dashboard App Shell)" after the generator's output was unusable (landing-page layouts + raw CSV leak). Will serve as the source of truth for the web interface work in issue #10.

### Added (sports dashboard widget — issue #141)
- **`supabase/migrations/20260415000001_add_sports_cache.sql`** — `sports_cache` table (`user_id`, `team_id`, `league`, `data jsonb`, `fetched_at`) with `unique(user_id, team_id)` and RLS on `auth.uid()`.
- **`web/src/lib/sync/sports/provider.ts`** — `SportsProvider` interface + normalized `Team`, `Game`, `Standing`, `SportsCacheData` types. Sport-agnostic shape so swapping providers is a one-file change.
- **`web/src/lib/sync/sports/thesportsdb.ts`** — TheSportsDB implementation. Maps raw API shapes into normalized types; computes current season heuristically per league.
- **`web/src/lib/sync/sports/index.ts`** — `syncSports(db, userId, favorites)`: per-team try/catch, upserts one row per team, evicts cache for teams no longer favorited.
- **`web/src/app/api/sports/search/route.ts`** — authenticated GET proxy → provider search; keeps API key server-side.
- **`web/src/app/api/sports/refresh/route.ts`** — authenticated POST → live sync for the user's favorites.
- **`web/src/components/dashboard/sports-card.tsx`** — dashboard widget. Collapsed row shows team + next game + last result (W/L color-coded); expand reveals standings + last 3 results. Empty-state links to `/settings#sports`. `var(--color-*)` only.
- **`web/src/components/settings/sports-settings.tsx`** — Settings section with debounced (300ms) team search via the proxy route, picker, and remove buttons.
- **`web/src/lib/types.ts`** — added `SportsCache` interface.

### Changed (sports dashboard widget — issue #141)
- **`web/src/app/api/cron/sync/route.ts`** — appended sports step after stocks; reads `sports_favorites`, calls `syncSports` with try/catch, no skip window.
- **`web/src/app/(protected)/dashboard/page.tsx`** — queries `sports_cache` + `sports_favorites`, renders `<SportsCard>`, exposes `refreshSports` server action.
- **`web/src/app/(protected)/settings/page.tsx`** — mounts `<SportsSettings>`; `saveSportsFavorites` persists JSON to `profile` and evicts orphaned `sports_cache` rows.
- **`web/src/app/api/chat/route.ts`** — registered `get_sports_data` tool inline next to `get_stock_quote`. Cache-first; live-fetches when cache is >12h old or the queried game is within 24h of now.
- **`web/.env.local.example`** + **`README.md`** — documented `SPORTSDB_API_KEY` (defaults to public test key `3` if unset).
- **`supabase/migrations/20260415000002_sports_cache_unique_per_league.sql`** — re-keys the unique constraint on `sports_cache` to `(user_id, team_id, league)`. ESPN team IDs are only unique within a league (Celtics NBA id=2 ≠ Bills NFL id=2); the previous `(user_id, team_id)` constraint would have merged cross-league rows.
- **`web/src/lib/sync/sports/espn.ts`** — ESPN unofficial-API provider (NBA/NFL/MLB/NHL/F1). Free, no key, no rate limit. Becomes the default; TheSportsDB stays as opt-in fallback via `SPORTS_PROVIDER=thesportsdb`.
- **`web/src/lib/sync/sports/provider.ts`** — `SportsProvider.getUpcoming/getRecent/getStandings` now take a `TeamRef` (carrying `league_id`) instead of a bare `teamId` so providers can dispatch per-sport endpoints. `Team` gains a nullable `color` (hex) for fallback badges when no logo is available (e.g. F1 constructors).
- **F1 special-casing in `sports-card.tsx`** — race name + date in place of "vs/@ opponent"; W/L coloring suppressed; standings line shows constructor rank + championship points without W-L record. Initials-on-color fallback badge for teams without logo URLs.
- **Smart-stale auto-refresh on dashboard load** — `watchlist-widget.tsx` and `sports-card.tsx` fire their refresh action in a non-blocking `useEffect` when the cache is stale (stocks: >1h during US market hours M-F 9:30am–4pm ET, >12h otherwise; sports: >6h, or any favorite missing a row). Keeps page render fast — auto-refresh hydrates after first paint.
- **Polygon rate-limit surfacing** — `syncStocks` now returns `{ rateLimited }`; `WatchlistWidget` shows an amber banner with `AlertTriangle` when a *manual* refresh hits the 5/min free-tier limit. Auto-refresh failures stay silent so the banner isn't persistent.
- **Watchlist sparkline 30-day window** — was 7 trading days (visually flat for stable tickers); now 30. Same Polygon call count, just a wider date range.
- **Dashboard layout reorder** — Schedule (full width) → Habits + Tasks → Watchlist + Sports → Important Emails. Stock + sports cards now sit together in their own row instead of bracketing Habits/Tasks.
- **`important-emails.tsx`** — emails received before today now show `Mon 4/13 9:47 AM` instead of just `9:47 AM`; today's emails still show only the time.

### Added (chat UX — issue #205)
- **`supabase/migrations/20260415000000_chat_sessions_soft_delete.sql`** — adds `deleted_at timestamptz` column + index to `chat_sessions`; enables archive with 30-day restore window.
- **`web/src/lib/relative-time.ts`** — dep-free helpers (`formatRelative`, `formatDaySeparator`, `isSameDay`, `daysUntilPurge`) for sidebar and thread timestamps.
- **`web/src/components/ui/undo-toast.tsx`** — self-contained toast provider with a 5-second undo affordance; mounted at the chat page root, no new dependencies.
- **`web/src/app/api/chat/sessions/[id]/restore/route.ts`** — `POST` endpoint clears `deleted_at` after ownership check.
- **`web/src/components/chat/chat-interface.tsx`** — day separators between messages when the day changes (`Today` / `Yesterday` / absolute date).
- **`web/src/components/chat/message-bubble.tsx`** — exact message time reveals under the bubble on hover (desktop) and long-press (mobile); hidden by default to keep the thread clean.
- **`web/src/components/chat/session-sidebar.tsx`** & **`session-sheet.tsx`** — relative-time stamps on each row, per-row trash icon, "Recently deleted" collapsible tray with Restore + remaining-days countdown.
- **`web/src/components/chat/session-sheet.tsx`** — sticky in-drawer header keeps "New chat" reachable while scrolling the session list on mobile.
- **`web/src/components/chat/chat-page-client.tsx`** — mobile "+" FAB for one-tap new chat; archive-with-undo flow; `visibilitychange` now also bumps a `timeTick` so sidebar relative stamps refresh without reload.

### Changed (chat UX — issue #205)
- **`web/src/app/api/chat/sessions/[id]/route.ts`** — `DELETE` now soft-deletes via `deleted_at` instead of hard-deleting; restore path lives at `/restore`.
- **`web/src/app/api/chat/sessions/route.ts`** — returns `deleted_at` with each session and fires a lazy purge of rows deleted >30 days ago (cascade wipes messages).

### Fixed (chat SSR loaded oldest messages, not latest — issue #210)
- **`web/src/app/(protected)/chat/page.tsx`** — SSR query was `order("created_at", asc).limit(50)`, returning the **oldest** 50 messages; for long sessions (86+ messages) this rendered positions 1–50 instead of the latest 20. Now mirrors the `/api/chat/sessions/[id]` API: `order("position", desc).limit(20)`, reversed for display. Also passes `initialHasMore` / `initialOldestPosition` to `ChatPageClient` so "Load older" pagination works from first paint.
- **`web/src/components/chat/chat-page-client.tsx`** — accepts `initialHasMore` / `initialOldestPosition` props and seeds the corresponding state from SSR.

### Fixed (chat SSR fetch cache — issue #208)
- **`web/src/app/(protected)/chat/page.tsx`** — added `export const fetchCache = "force-no-store"` so Supabase queries on the chat route bypass Next.js Data Cache; SSR was replaying cached rows from an earlier render, causing `/chat` to render messages from old positions in the same session. `force-dynamic` alone does not disable sub-request fetch caching.

### Fixed (chat stale session on tab return — issue #206)
- **`web/src/components/chat/chat-page-client.tsx`** — visibility-change handler now re-fetches `/api/chat/sessions` and switches to the most recent session before loading messages, mirroring the mount-time correction; fixes residual stale-conversation bug from #195 when `activeSessionId` itself was stale

### Fixed (meal scanner UX — issue #203)
- **`web/src/app/(protected)/meals/FoodPhotoAnalyzer.tsx`** — split scan trigger into "Take Photo" (camera) and "From Library" (gallery) buttons across all three trigger locations: empty state, add-another row, and error recovery
- **`web/src/app/(protected)/meals/FoodPhotoAnalyzer.tsx`** — re-estimation now applies `food_name` from API response to the item label; dish name field added to expanded edit panel for direct manual editing
- **`web/src/app/(protected)/meals/FoodPhotoAnalyzer.tsx`** — replaced chat redirect with inline ephemeral Mr. Bridge panel; session is deleted on close so it never appears in chat history
- **`web/src/app/(protected)/meals/InlineMealChat.tsx`** — new ephemeral inline chat component; prepends scanned nutrition context to first message, streams response via Vercel AI SDK data stream protocol
- **`web/src/app/api/chat/sessions/[id]/route.ts`** — added DELETE handler; verifies ownership, deletes session row (messages cascade via ON DELETE CASCADE)

### Changed
- **`README.md`** — replaced Mermaid architecture diagram with D2-rendered SVG (`docs/architecture.svg`); diagram now includes Renpho, Polygon.io/stocks pipeline, Notifications page, ntfy.sh alert scripts, and all 10 pages (#182)

### Added
- **`docs/architecture.d2`** — D2 source for the architecture diagram; left-to-right layout with colour-coded containers (data sources, sync layer, Supabase hub, Next.js/Vercel, external APIs, alert scripts)
- **`docs/architecture.svg`** — rendered SVG output from `d2 --theme=200`

### Added (meal scanner redesign — issue #199)
- **`web/src/app/(protected)/meals/FoodPhotoAnalyzer.tsx`** — redesigned Scanner tab as a multi-scan session: scan multiple labels or food photos, see combined macros live, then log directly, split into meal prep containers, or hand off to Chat with nutrition context pre-filled; includes manual entry fallback on scan error, per-item ingredient editing with re-estimation, and navigation guard when leaving with unsaved scans
- **`web/src/app/api/meals/log/route.ts`** — added `count` field to POST body; when `count > 1`, inserts multiple identical rows (used by meal prep to log N containers in one request)
- **`web/src/components/chat/chat-interface.tsx`** — added `initialInput?: string` prop; seeds the chat input on mount (used for Scanner → Chat handoff)
- **`web/src/components/chat/chat-page-client.tsx`** — added mount effect that reads `chatPrefill` from `sessionStorage` and passes it to `ChatInterface` as `initialInput`
- **`web/src/components/meals/MealsClient.tsx`** — added navigation guard: intercepts tab switches away from Scanner when unsaved scans exist; shows inline banner with "Keep scanning" / "Discard and leave" options

### Added (stock watchlist dashboard widget — issue #142)
- **`supabase/migrations/20260414000002_add_stocks_cache.sql`** — `stocks_cache` table: per-user ticker cache with `price`, `change_abs`, `change_pct`, `sparkline` JSONB (7-day EOD bars), and `fetched_at`; RLS restricts to owner
- **`web/src/lib/types.ts`** — added `StocksCache` interface
- **`web/src/lib/sync/stocks.ts`** — shared Polygon.io helper (`syncStocks`); fetches `/v2/aggs/ticker/{T}/prev` for price/change and `/v2/aggs/ticker/{T}/range/1/day` for 14-day window trimmed to last 7 trading bars; upserts to `stocks_cache`
- **`web/src/app/api/stocks/refresh/route.ts`** — authenticated POST handler; reads `stock_watchlist` from `profile` and calls `syncStocks`; returns `{ updated }`
- **`web/src/app/api/stocks/validate/route.ts`** — GET proxy for Polygon `/v3/reference/tickers`; keeps `POLYGON_API_KEY` server-side; returns `{ valid: boolean }`
- **`web/src/app/api/cron/sync/route.ts`** — added stocks sync step after health syncs; reads `stock_watchlist` for `ownerUserId` and calls `syncStocks` if non-empty; logged in `results.stocks`
- **`web/src/components/dashboard/watchlist-widget.tsx`** — `WatchlistWidget` client component; 3-column ticker rows (symbol+timestamp / recharts 80×32 sparkline / price+change colour-coded green/red); refresh button with `useTransition` spinner; no-API-key and empty-watchlist states; sparkline hidden below 480px for clean mobile layout
- **`web/src/app/(protected)/dashboard/page.tsx`** — fetches `stocks_cache` rows in `Promise.all`; `refreshStocks` server action calls `syncStocks` directly then `revalidatePath`; renders `<WatchlistWidget>` below Habits/Tasks grid
- **`web/src/components/settings/watchlist-settings.tsx`** — `WatchlistSettings` client component; uppercase ticker input + Add button with server-proxy validation; per-ticker remove buttons; saves immediately on add/remove; no-API-key warning banner
- **`web/src/app/(protected)/settings/page.tsx`** — `saveWatchlist` server action; reads `stock_watchlist` profile key; renders `<WatchlistSettings>` below `ProfileForm`
- **`web/src/app/api/chat/route.ts`** — added `get_stock_quote` tool; checks `stocks_cache` first (6h freshness); falls back to live Polygon `/prev` fetch if stale or not found

### Added (weekly workout program in fitness tab — issue #192)
- **`supabase/migrations/20260414000000_add_workout_plans.sql`** — new `workout_plans` table: per-user, per-date rows with `warmup`, `workout`, `cooldown` JSONB arrays, optional `notes`, and `calendar_event_id`; RLS policy restricts to owner
- **`web/src/lib/types.ts`** — added `WorkoutExercise` and `WorkoutPlan` interfaces
- **`web/src/app/api/chat/route.ts`** — added `get_workout_plan` (fetches current Mon–Sun week), `assign_workout` (upserts one day's plan + creates/updates a timed Google Calendar event), and `update_workout_exercise` (patches a single exercise by name within a phase and refreshes the calendar event); added `buildCalendarDescription` helper; demo mode no-ops for all three tools
- **`web/src/components/fitness/weekly-workout-plan.tsx`** — new client component; renders Mon–Sun cards with expand/collapse, Today badge, green checkmark for completed days, and three-phase exercise rows (Warm-up / Workout / Cool-down)
- **`web/src/app/(protected)/fitness/page.tsx`** — queries `workout_plans` for current week; derives `completedDates` from existing `allWorkouts`; renders `WeeklyWorkoutPlan` above body composition chart

### Changed (perf: reduce Anthropic API costs — issue #189)
- **`web/src/app/api/chat/route.ts`** — `maxSteps` reduced from 25 to 12; system prompt split into static (cached with `cacheControl: ephemeral`) + dynamic (date + name, uncached) content blocks to prevent daily cache busts; context window trimmed from 20 to 10 messages; top-level `providerOptions` cacheControl block removed (now inline on static block); `selectModel` accepts optional `model` override from request body; system prompt adds graceful step-limit rule and `get_session_history` consent rule
- **`web/src/app/api/chat/route.ts`** — new `get_session_history` tool: fetches up to 40 earlier messages from the current session on demand; model asks user before calling
- **`web/src/app/api/chat/route.ts`** — expanded Haiku routing patterns: meal queries, goal reads, habit checks, profile reads, inline log commands
- **`web/src/components/chat/chat-interface.tsx`** — model override chip (Auto / Haiku / Sonnet) in the input bar; defaults to Auto (uses `selectModel` routing); overrides passed as `model` in POST body; resets to Auto on page reload

### Fixed (nutrition scanner opens camera directly — issue #186)
- **`web/src/app/(protected)/meals/FoodPhotoAnalyzer.tsx`** — added `capture="environment"` to the hidden file input so mobile browsers open the rear camera directly instead of showing the file picker

### Fixed (deduplicate add_task inserts — issue #176)
- **`web/src/app/api/chat/route.ts`** — added 90-second deduplication window to `add_task` execute; before inserting, queries for an active task with the same title (case-insensitive) and due_date created in the last 90 seconds; returns the existing row instead of inserting a duplicate (guards against `retryOnOverload` stream-retry double-inserts)

### Fixed (habit edit form — issue #175)
- **`web/src/app/(protected)/habits/page.tsx`** — added `updateHabit` server action that updates `name`, `emoji`, and `category` on `habit_registry`, scoped to authenticated user; passed as `updateAction` prop to `HabitTodaySection`
- **`web/src/components/habits/habit-today-section.tsx`** — added `updateAction` to Props interface and passes it down to each `HabitToggle`
- **`web/src/components/habits/habit-toggle.tsx`** — added `updateAction` prop, local edit state (`editing`, `editName`, `editEmoji`, `editCategory`), and an inline edit form with emoji/name/category inputs and Save/Cancel buttons; shown when manageMode is true and Edit is clicked

### Added (emoji picker for Add Habit form — issue #174)
- **`web/src/components/habits/habit-today-section.tsx`** — replaced plain emoji text input with an `emoji-picker-react` popover button; closes on emoji selection or outside click
- **`web/package.json`** — added `emoji-picker-react` dependency

### Added (meal log inline editing — issue #173)
- **`web/src/app/api/meals/log/route.ts`** — added `PATCH` handler; accepts `id`, `notes`, `meal_type`, `calories`, `protein_g`, `carbs_g`, `fat_g`; validates meal_type; scoped to authenticated user's rows via `.eq("user_id", user.id)`
- **`web/src/components/meals/MealsClient.tsx`** — added inline edit state and form to both `TodayTab` and `PastMeals`; tapping a meal row enters edit mode with pre-filled fields; Save calls `PATCH /api/meals/log` then refreshes; Cancel discards changes

### Fixed (task due date label off-by-one — issue #184)
- **`web/src/components/tasks/task-item.tsx`** — `relativeDue` now compares two midnights using `todayString()` from `@/lib/timezone` instead of subtracting `Date.now()`, eliminating the off-by-one that showed tomorrow's tasks as "Today" late in the evening

### Fixed (tasks tab broken by relational join — issue #172)
- **`web/src/app/(protected)/tasks/page.tsx`** — replaced `tasks!tasks_parent_id_fkey` relational join (which silently errored when the FK constraint name didn't match) with a separate subtasks query merged in JS; added `console.error` logging for all three query results so future failures surface in server logs
- **`web/src/lib/types.ts`** — updated `Task.subtasks` from `Subtask[]` to `Task[]` to match the two-query merge approach

### Added (journal editor Submit button — issue #178)
- **`web/src/components/journal/journal-editor.tsx`** — added explicit Submit button below the Reflect and Free Write tab content; on click flushes any pending debounce, saves immediately, clears form fields, shows a 3-second "Entry saved." confirmation banner, and scrolls to past entries
- **`web/src/app/(protected)/journal/page.tsx`** — added `id="journal-history"` to the past-entries section so the editor can scroll to it after submit

### Fixed (chat session lost on mobile tab switch and refresh — issue #171)
- **`web/src/components/chat/chat-page-client.tsx`** — added `useEffect` to persist `activeSessionId` to `sessionStorage` on every change; added mount-time fallback that reads `sessionStorage` when `initialSessionId` is null (covers edge cases where SSR couldn't resolve the last session)
- **`web/src/app/(protected)/chat/page.tsx`** — server-side fix was already in place (queries `chat_sessions` ordered by `last_active_at desc`, pre-loads `initialMessages`); no changes needed

### Fixed (radial wheel clipping on mobile — issue #170)
- **`web/src/components/habits/radial-completion.tsx`** — increased `ResponsiveContainer` height from 220 → 260; reduced `outerRadius` from 90 → 80 to prevent outer rings from overflowing the card on 390px viewports

### Added (nutrition facts label scanner with serving multiplier and daily macro context — issue #165)
- **`web/src/app/api/meals/analyze-photo/route.ts`** — added `NutritionLabelSchema` (product name, serving size, servings per container, calories, protein, carbs, fat, fiber, sugar, sodium, readable flag, notes); added optional `mode` form field (`food` | `label`, default `food`); in label mode calls `generateObject` with `NutritionLabelSchema` and an exact-read prompt; both modes now return `{ mode, ...object }` so the client can distinguish
- **`web/src/app/api/meals/today-totals/route.ts`** — new auth-gated GET route; queries `meal_log` for today's date and returns summed `calories / protein_g / carbs_g / fat_g`
- **`web/src/app/(protected)/meals/FoodPhotoAnalyzer.tsx`** — added pill-style "Food photo | Nutrition label" mode toggle above the upload button (matches `GranularityToggle` pattern); label mode passes `mode=label` in FormData; label result card shows product name + serving size prominently, macro table (Calories / Protein / Carbs / Fat / Fiber / Sugar / Sodium) with "—" for nulls, serving multiplier input (0.5 steps, live client-side multiplication), and "Log this" button logging macros × multiplier to `meal_log` with source `"label"`; unreadable label shows warning and retry prompt; both food and label result cards show a "How this fits today" row (fetched once from `/api/meals/today-totals` when results arrive) displaying today's running totals and calories being added

### Added (centralized meal hub with tabs and get_today_meals tool — issue #163)
- **`web/src/components/meals/MealsClient.tsx`** — new "use client" component wrapping the entire meals experience in four pill-style tabs (Today, Recipes, Scanner, Plan); tab state managed locally, default tab is Today
- **Tab: Today** — today's meals grouped by type with macro totals, inline macro progress bars (replicates MacroSummaryCard logic from server-fetched props), quick-log form with meal type + description + collapsible macro fields (calories/protein/carbs/fat), log-via-chat nudge
- **Tab: Recipes** — client-side searchable list of saved recipes filtered on name/tags/ingredients; each card collapses/expands to reveal ingredients; "Use this recipe" button prompts for meal type then POSTs to `/api/meals/log`
- **Tab: Scanner** — mounts `FoodPhotoAnalyzer` as-is (pre-upload context textarea already implemented)
- **Tab: Plan** — ingredient textarea; on submit POSTs to new `/api/meals/suggest`; displays 2–3 Claude-generated suggestion cards with macros, saved-recipe badge, and "Log this" inline logging
- **`web/src/app/api/meals/suggest/route.ts`** — new POST endpoint; auth-guarded; fetches saved recipes and dietary preferences from profile; calls `generateObject` with Claude Sonnet 4.6 to return 2–3 meal suggestions calibrated to remaining macro budget; flags saved-recipe matches with `isSaved: true` and `recipeId`
- **`web/src/app/api/chat/route.ts`** — added `get_today_meals` tool (read-only, no-arg query of today's `meal_log` entries); removed `log_meal` tool (meal logging is now exclusively done through the Meals tab UI); updated system prompt to instruct Mr. Bridge to call `get_today_meals` before making any claim about today's intake, and to redirect meal-logging requests to the Meals tab
- **`web/src/app/(protected)/meals/page.tsx`** — refactored from a monolithic server-rendered page to a thin data-fetching layer; now fetches meals, recipes, and profile (macro goals) in parallel and passes computed props (`todayMeals`, `pastMeals`, `macroTotals`, `macroGoals`, `recipes`) to `MealsClient`; past-6-day log renders below the tab container

### Added (loading skeletons for all protected routes — issue #164)
- **`web/src/app/(protected)/dashboard/loading.tsx`** — header + health breakdown chart + 2×2 card grid
- **`web/src/app/(protected)/fitness/loading.tsx`** — header + window selector strip + 2×2 chart grid
- **`web/src/app/(protected)/habits/loading.tsx`** — header + radial circle + streak chart + habit row list
- **`web/src/app/(protected)/tasks/loading.tsx`** — header + add-form card + 3 priority group skeletons
- **`web/src/app/(protected)/weekly/loading.tsx`** — header + 3 summary cards + chart + summary card
- **`web/src/app/(protected)/journal/loading.tsx`** — header + tall editor card + 2 collapsed entry rows
- **`web/src/app/(protected)/meals/loading.tsx`** — header + tab bar pills + 2 content cards
- **`web/src/app/(protected)/notifications/loading.tsx`** — header + 5 notification row skeletons
- **`web/src/app/(protected)/settings/loading.tsx`** — header + 6 label/input row skeletons
- **`web/src/app/(protected)/chat/loading.tsx`** — centered "Loading conversation…" text + input bar skeleton; eliminates blank-page gap on all protected route navigations

### Added (edit task due date and priority — issue #157)
- **`web/src/app/(protected)/tasks/page.tsx`** — `updateTask` server action now accepts a `fields` object (`title?`, `due_date?`, `priority?`) instead of a bare title string; also revalidates `/dashboard` on update
- **`web/src/components/tasks/task-item.tsx`** — `updateAction` prop updated to match new fields signature; `SubtaskRow` and `TaskItem` `commitEdit` calls updated accordingly; added `showEditPanel` toggle (Pencil icon, size 13) next to the Archive button; when open, renders an inline row with a date input, a clear-date button, a priority select, and Save/cancel buttons; initializes from current task values

### Added (sign out button — issue #156)
- **`web/src/components/ui/sign-out-button.tsx`** — new client component; calls `supabase.auth.signOut()` and redirects to `/login`
- **`web/src/components/nav.tsx`** — desktop sidebar: sign-out section with top border below demo banner; mobile More sheet: Sign Out button as last grid item, inlines sign-out logic to avoid redundant imports

### Fixed (journal data leak and sync failure — issue #133)
- **`supabase/migrations/20260413000006_journal_entries_rls_and_constraint.sql`** — `journal_entries` had RLS policies from the multitenancy migration but `ENABLE ROW LEVEL SECURITY` was never called, so all queries returned every user's rows; migration enables RLS so the existing per-user policies take effect
- **`supabase/migrations/20260413000006_journal_entries_rls_and_constraint.sql`** — unique constraint was `(user_id, date)` (migration 003) but `saveJournalEntry` targeted `onConflict: "date,user_id"`; the column-order mismatch caused upserts to fail when another user had a row for the same date; constraint dropped and recreated as `journal_entries_date_user_id_key UNIQUE (date, user_id)` matching the upsert target
- **`web/src/app/(protected)/journal/page.tsx`** — no code changes needed; queries use `createClient()` (user-scoped) and `saveJournalEntry` already includes `user_id: user.id`; both work correctly once RLS is active

---

## [1.0.0] — 2026-04-13

### Fixed (pre-1.0 audit — security and server action correctness)
- **`web/src/app/api/google/calendar/route.ts`, `gmail/route.ts`, `calendar/upcoming-birthday/route.ts`** — missing auth guard: unauthenticated callers fell through to real Google Calendar/Gmail API and received owner's live data; added `if (!user) return 401` before the demo-user check
- **`web/src/app/api/meals/analyze-photo/route.ts`, `meals/estimate-macros/route.ts`** — no auth check at all; unauthenticated callers could trigger Anthropic API calls; added auth guard
- **`web/src/app/api/weather/route.ts`** — no auth check; switched from `createServiceClient` (reads all users' profile rows) to `createClient` with user-scoped `.eq("user_id", user.id)` filter; added `if (!user) return 401`
- **`web/src/app/api/chat/route.ts`** — unauthenticated callers could reach the Anthropic stream; added `if (!user) return 401`; `userId` is now non-nullable after the guard so all downstream `.eq("user_id", userId)` filters are unconditionally applied
- **`.gitignore`** — added `.env.local` and `.env.*.local` rules; previously only `.env` was ignored, leaving `web/.env.local` unprotected from accidental `git add`
- **`web/src/app/(protected)/dashboard/page.tsx`** — `toggleHabit` server action upserted habits without `user_id`; new entries would fail `NOT NULL` constraint; added `getUser()` guard and `user_id: user.id` in upsert payload
- **`web/src/app/(protected)/habits/page.tsx`** — `toggleHabit` and `addHabit` server actions missing `user_id`; fixed with `getUser()` guard and `user_id: user.id` on all writes
- **`web/src/app/(protected)/tasks/page.tsx`** — `addTask` and `addSubtask` used `user?.id` (nullable); if auth ever fails these would insert `undefined` into `user_id NOT NULL`; strengthened to `if (!user) return { error: "Unauthorized" }` with non-nullable `user.id`

### Fixed (pre-1.0 audit — multitenancy correctness)
- **`scripts/check_hrv_alert.py`, `check_weather_alert.py`, `check_task_due_alerts.py`, `check_daily_alerts.py`** — `set_profile_value` / `get_profile_value` helpers updated to pass `user_id` (NOT NULL violation after multitenancy migration) and fix `on_conflict="key"` → `on_conflict="user_id,key"`; all task/recovery queries now filter by `owner_user_id`
- **`check_daily_alerts.py`** — tasks query used nonexistent `name` column; corrected to `title`
- **`scripts/fetch_weather.py`** — profile select without user_id filter now scopes to `owner_user_id` when available; docstring example snippet updated with correct upsert pattern
- **`web/src/lib/sync/oura.ts`, `fitbit.ts`, `googlefit.ts`** — `syncOura`, `syncFitbit`, `syncGoogleFit` functions now require a `userId` string parameter; all DB queries and inserts include `user_id`; `onConflict` strings updated to include `user_id` (e.g. `date` → `user_id,date`); fixes NOT NULL violation on all sync table inserts post-multitenancy migration
- **`web/src/app/api/sync/{oura,fitbit,googlefit}/route.ts`** — pass `user.id` to sync functions (previously passed none)
- **`web/src/app/api/cron/sync/route.ts`** — read `OWNER_USER_ID` from env and pass to all sync functions; return 500 if not configured
- **`web/src/app/(protected)/settings/page.tsx`** — `updateProfile` and `deleteProfile` server actions now fetch the authenticated user and include `user_id` in all profile writes; `onConflict` fixed to `user_id,key`
- **`web/.env.local.example`** — added `OWNER_USER_ID` variable with setup instructions; Fitbit token bootstrap snippet updated with correct `user_id,key` upsert pattern
- **`README.md`** — table counts updated (14 → 16); migration list updated to include all 20260413 migrations; `web/.env.local` table gains `OWNER_USER_ID` row; Fitbit token snippet corrected; tool count updated (13 → 16)
- **`.claude/rules/mr-bridge-rules.md`** — location set/reset code snippets updated to include `user_id` and correct `on_conflict`; name storage snippet updated; Data Sources table updated (`chat_sessions/chat_messages` now points to Chat API, no longer "future"); `chat_sessions` + `chat_messages` table entry updated to reflect shipped state

### Changed (remove pantry assumption; treat saved recipes as library — issue #152)
- **System prompt — recipe/meal planning block** — replaced the 6-step "ingredients on hand" flow with a new block that: (1) assumes bare-essential pantry only (salt, pepper, oils, spices, etc.) unless the user specifies ingredients in chat; (2) instructs the assistant to suggest 1–2 recipes from its own knowledge in addition to searching the saved library; (3) asks the user what proteins/produce they have if not stated; (4) removes the step that read pantry staples from the profile
- **`get_recipes` tool description** — updated to clarify the saved list is a library to draw from, not a constraint; assistant must not limit suggestions to saved recipes only

### Added (mobile newline input + paginated chat load more — issue #149)
- **Mobile Enter = newline** — `chat-interface.tsx` detects touch devices via `window.matchMedia("(pointer: coarse)")` on mount; on mobile, `Enter` always inserts a newline (no submit); on desktop, plain `Enter` submits and `Shift+Enter` inserts a newline; `enterKeyHint` on the textarea is `"enter"` on mobile and `"send"` on desktop
- **Cursor-based pagination in GET `/api/chat/sessions/[id]`** — query now accepts `before` (position cursor) and `limit` (max 50, default 20) params; fetches newest-first, reverses for display, returns `{ messages, hasMore, oldestPosition }`; initial load is capped at 20 messages
- **"Load older messages" button** — `chat-page-client.tsx` tracks `hasMore`, `oldestPosition`, `loadingMore`; clicking the button prepends older messages while preserving scroll position via `scrollHeight` diff; button shows a `Loader2` spinner while fetching

### Added (subtasks + grocery list UI — issue #144)
- **`parent_id` column on `tasks`** — migration `20260413000008_tasks_parent_id.sql` adds `parent_id uuid references tasks(id) on delete cascade` and a supporting index; applied to live DB
- **`Subtask` type** added to `web/src/lib/types.ts`; `Task` extended with `parent_id: string | null` and optional `subtasks?: Subtask[]`
- **Three new server actions** in `tasks/page.tsx`: `addSubtask` (inserts with `parent_id`), `completeSubtask` (completes sibling-check → auto-completes parent when all done), `deleteSubtask` (hard delete)
- **`completeTask` now cascades** — after completing the parent, also marks all active subtasks completed
- **`TaskItem` extended** — progress indicator (`X / Y`) in parent title row (green when all done); chevron expand/collapse (default: expanded ≤3, collapsed >3); inline subtask list with checkbox, editable title, delete button; always-visible "Add item…" input at bottom of expanded list; Enter submits and keeps focus for rapid grocery entry
- **Dashboard tasks query** and **tasks page active query** both filter `parent_id IS NULL` so subtasks never appear as standalone items
- **`add_task` chat tool** accepts optional `parent_id`; system prompt updated to instruct the model to call `get_tasks` first when adding list items, then `add_task` with `parent_id`

### Fixed (fitness chart date format and mobile tick density — issue #150)
- **`web/src/lib/chart-utils.ts`** — new shared utility with `formatDate` (YYYY-MM-DD → "Apr 11"), `computeDailyTicks` (filters dates to a readable subset based on window key), `computeWeeklyTicks` (filters weekly labels based on week count), and `daysToWindowKey` (inverse of WINDOW_DAYS)
- **Date format standardized** — all five fitness charts now use `formatDate` ("Apr 11") instead of the previous mix of `date.slice(5)` ("04-11") on body-comp/weight-goal/body-fat-goal and `toLocaleDateString` on workout-freq/active-cal-goal; the local `dayLabel` helpers in those charts were removed in favor of the shared import
- **Mobile tick density fixed** — removed `interval={0}` from all five `<XAxis>` elements; replaced with explicit `ticks` arrays computed by `computeDailyTicks`/`computeWeeklyTicks`; density rules: 7d → all, 14d/30d → Mondays only, 90d/1yr → every 14th date; weekly mode: ≤8 weeks → all, 9–26 weeks → every 2nd, >26 weeks → every 4th
- **`windowKey` prop added** to `BodyCompDualChart`, `WeightGoalChart`, and `BodyFatGoalChart`; `fitness/page.tsx` passes `windowKey` from `getWindow()` to all three; `WorkoutFreqChart` and `ActiveCalGoalChart` derive window key from their existing `days` prop via `daysToWindowKey`

### Added (daily/weekly toggle on fitness charts — issue #145)
- **`GranularityToggle` component** — `web/src/components/ui/granularity-toggle.tsx`; `Daily | Weekly` pill toggle matching window-selector style; greyed out with tooltip when `disabled`
- **`WorkoutFreqChart`** — prop changed from `weekCount` to `days: number`; `granularity` state (`daily`/`weekly`); auto-forces weekly + disables toggle when `days > 90`; daily mode plots one slot per calendar day (green `#10B981` with goal, indigo `#6366F1` without, rest day `#1E2130`); weekly mode retains existing ISO-week bucketing; x-axis shows only Monday ticks at >14d, all days at ≤14d
- **`ActiveCalGoalChart`** — same prop rename and granularity state; daily mode plots raw `active_cal` values with daily target reference line (`Math.round(goal / 7)`); weekly mode retains week-sum logic; same tick density logic
- **Fitness page** — replaced hardcoded `weekCount={8}` on both charts with `days={days}` from the window selector cookie

### Fixed (mobile weather H/L wrapping — issue #147)
- **`DashboardHeader`** — `whiteSpace: "nowrap"` on the H/L `<span>` prevents the string from breaking mid-value; `flex-wrap` + `gap-x-1.5 gap-y-0` on the weather `<p>` allows a clean break after the condition text on very narrow screens

### Added (notification history center — issue #99)
- **`notifications` table** — new Supabase table (`id`, `user_id`, `type`, `title`, `body`, `sent_at`, `read_at`) with RLS, per-user composite index on `(user_id, sent_at desc)`, and a partial index for unread rows; migration `20260413000007_notifications.sql` applied to live DB
- **`log_notification` helper** in `scripts/_supabase.py` — inserts a row after each successful push notification; non-fatal (errors go to stderr only)
- **HRV, weather, task, and birthday scripts updated** — `check_hrv_alert.py`, `check_weather_alert.py`, `check_daily_alerts.py`, `check_birthday_notif.py` all call `log_notification` with `type`, `title`, and `body` after a confirmed `subprocess.run` success; `check_birthday_notif.py` initializes its own Supabase client for this purpose
- **30-day TTL cleanup** wired into `api/cron/sync/route.ts` (runs daily at 6 AM PST) — deletes rows where `sent_at < now() - 30 days` before syncs run; time-based rather than count-based so recent unread notifications are never silently dropped
- **`/notifications` page** — server component at `web/src/app/(protected)/notifications/page.tsx`; fetches last 50 notifications within the 30-day window; marks all unread as read on page load via a single `UPDATE` before rendering; passes `isUnread` flag per row to the client component
- **`NotificationList` client component** — `web/src/components/notifications/notification-list.tsx`; type filter pills (All / HRV / Weather / Tasks / Birthday); per-row icon by type; relative time display (`Just now`, `2 hours ago`, `Yesterday`, weekday, or `Apr 3`); left-border accent + bold title for unread rows at fetch time; "No notifications yet" empty state
- **`/api/notifications/unread-count` route** — returns `{ count: number }` for unread rows within the 30-day window; called by Nav on mount and on route change
- **Notifications nav item** — `Bell` icon added to `NAV_ITEMS` between Chat and Settings; appears in desktop sidebar and in the More bottom sheet on mobile; red dot/count badge rendered on the Bell icon when `unreadCount > 0`; badge refreshes on every route change via `useEffect([pathname])`

### Fixed (chat textarea with shift+enter + auto-expand, mobile bottom spacing — issue #134)
- **`<input>` replaced with auto-expanding `<textarea>`** — `chat-interface.tsx` now uses a `<textarea rows={1}>` with an auto-resize effect that sets height from `scrollHeight` on every input change; capped at `max-height: 200px` with `overflow-y: auto` so the field scrolls internally rather than growing unbounded
- **Shift+Enter inserts newlines** — `handleKeyDown` now passes through `Enter` when `shiftKey` is held, allowing multi-line input; plain Enter submits (or applies a slash command if the menu is open)
- **Mobile bottom spacing fixed** — replaced `height: calc(100dvh - 8rem)` hardcoded on `ChatInterface` with a flex-fill chain: `chat/page.tsx` wraps in `h-full flex flex-col`; `chat-page-client.tsx` root div and content row use `flex flex-col flex-1 min-h-0`; `ChatInterface` root div uses `flex flex-col flex-1 min-h-0` — the chat fills available layout height without dead space below the input bar on mobile

### Fixed (journal entries data leak and broken saves — issue #133)
- **RLS enabled on `journal_entries`** — migration `20260413000006_journal_entries_rls_and_constraint.sql` calls `alter table journal_entries enable row level security`; the per-user policy added in the multitenancy migration was inert until RLS itself was switched on, meaning any authenticated user could read all entries
- **Unique constraint fixed for multi-tenancy** — same migration drops `journal_entries_user_id_date_unique` (column order `user_id, date`) and recreates as `journal_entries_date_user_id_key` with `(date, user_id)`; the old single-column `date` constraint was already replaced in `20260413000003`, but this migration normalizes the name and column order to match the upsert conflict target
- **`saveJournalEntry` now passes `user_id`** — server action in `web/src/app/(protected)/journal/page.tsx` resolves the authenticated user via `supabase.auth.getUser()`, returns `{ error: "Unauthorized" }` if no session, includes `user_id: user.id` in the upsert payload, and uses `onConflict: "date,user_id"` instead of `"date"`
- **Demo data attribution corrected** — 4 journal entries that were incorrectly attributed to `demo@mr-bridge.app` (backfill assigned wrong owner) were updated to the real owner's `user_id` directly against the live DB

### Fixed (food photo upload fails on mobile — issue #135)
- **Client-side compression** — `compressImage` helper in `FoodPhotoAnalyzer.tsx` uses the Canvas API to cap the longest edge at 1920 px and re-encode as JPEG at 0.85 quality before upload; replaces the raw file in FormData so uploads stay well under Vercel's 4.5 MB limit
- **HEIC early rejection (client)** — if the selected file is `image/heic` or ends in `.heic`, an error is shown immediately with instructions to switch iPhone Camera to "Most Compatible"; no upload is attempted
- **Safe JSON parsing** — `handleFileChange` checks `content-type` before calling `.json()`; a non-JSON 413 response is detected from the body text and surfaces "Image is too large to upload. Please try a smaller photo."
- **Server-side size guard lowered to 4 MB** — `MAX_SIZE` in `analyze-photo/route.ts` changed from 10 MB to 4 MB (below Vercel's 4.5 MB cutoff); error message updated to match; returns `413` so the client can detect it
- **HEIC server-side rejection** — `SUPPORTED_TYPES` check added after file-type validation; unsupported formats return `415 Unsupported Media Type` with a descriptive message

### Fixed (meal log route missing user_id — issue #136)
- **`user_id` added to insert payload** — `POST /api/meals/log` now resolves the authenticated user via `supabase.auth.getUser()` and includes `user_id` in the `meal_log` insert; returns `401 Unauthorized` if no session
- **Service client replaced** — `createServiceClient` swapped for `createClient` from `@/lib/supabase/server` so the route operates under the user's session context

### Fixed (chat de-sync — messages disappear or appear out of order on refresh — issue #132)
- **Early user message persistence** — user message and session row are now inserted at the start of the POST handler, before `streamText` is called; `onFinish` only inserts the assistant reply; messages now survive stream errors, timeouts, and aborts
- **`position` column on `chat_messages`** — migration `20260413000005_chat_messages_position.sql` adds a `bigint position` column; each insert derives `MAX(position) + 1` within the session so ordering is deterministic and independent of `created_at` timestamp precision
- **Ordering by `position ASC`** — both `api/chat/sessions/[id]/route.ts` (history fetch) and the in-request context load in `api/chat/route.ts` now order by `position` instead of `created_at`
- **Retry dedup guard** — before inserting the user message, the handler checks for an identical message in the same session inserted within the last 10 seconds; duplicate inserts on retry are skipped

### Added (calendar delete/move, conflict detection, deduplication — issue #129)
- **`eventId` in `list_calendar_events`** — each returned event now includes `eventId` (Google Calendar event ID); tool description updated so Bridge knows to preserve it for follow-up calls
- **`delete_calendar_event` tool** — deletes an event by `eventId`; system prompt rule requires Bridge to state title/date/time and obtain explicit user confirmation before calling
- **`update_calendar_event` tool** — patches an existing event by `eventId`; accepts any subset of `summary`, `start`, `end`, `location`, `description`; system prompt rule requires stating before/after diff and explicit user confirmation
- **Conflict detection pre-flight** — system prompt rule: before every `create_calendar_event`, Bridge must call `list_calendar_events` for the target date, check for time overlaps, surface any conflict to the user, and wait for explicit confirmation; rule also enforced in the `create_calendar_event` tool description
- **Deduplication pre-flight** — extended from conflict detection: if an event with a matching title (case-insensitive) already exists on the target date, Bridge surfaces it and asks whether to create another, update the existing one, or skip

### Added (workout deduplication and history UI — issue #127)
- **`ACTIVITY_ALIASES` map** in `scripts/sync-fitbit.py` and `web/src/lib/sync/fitbit.ts` — normalizes Fitbit variant names to canonical labels before dedup key is built and before DB insert (e.g. "Walking" → "Walk", "Running" → "Run", "Biking" → "Bike"); existing keys in the DB are also normalized during comparison so pre-migration rows are not re-inserted
- **Time-overlap detection** in both sync paths — before inserting, checks if an existing workout on the same date has a `start_time` within ±5 minutes; prefers the row with HR data, then longer duration; inferior existing rows are deleted and replaced
- **DB migration** `20260413000001_workout_sessions_unique_constraint.sql` — adds `unique (date, start_time, source)` constraint to `workout_sessions`
- **`scripts/normalize_workout_activities.py`** — one-time script to normalize activity names in existing rows; run with `--yes` to apply; dry-run by default
- **Workout history table** (`workout-history-table.tsx`) enhancements:
  - Start time column — formatted as `h:mm AM/PM` from stored `HH:MM:SS`
  - End time column — derived as `start_time + duration_mins`, same format
  - HR Zones secondary line — `metadata.hr_zones` string ("Peak: 3m | Cardio: 12m") shown inline below the date cell when present
  - Source badge — small pill showing "fitbit" / "manual" with accent color for fitbit
  - Activity type filter — pill row above the table to filter by activity; resets to page 1 on change
- **`WorkoutSession` type** (`web/src/lib/types.ts`) — added `metadata: { hr_zones: string | null } | null` field

### Added (demo account + multi-tenancy — issue #50)
- **Multi-tenancy migration** — `user_id uuid references auth.users(id)` added to all 14 tables; existing rows backfilled with owner's auth UID; RLS policies updated from `using (true)` → `using (auth.uid() = user_id)`; per-user indexes added
- **Demo account** — `demo@mr-bridge.app` with realistic seed data: Alex Chen persona, 7 habits at ~60% completion over 30 days, body comp trend arc, 18 workout sessions, 30 recovery nights, 10 tasks, 5 study entries, 4 journal entries, 5 recipes
- **Groq chat for demo** — demo user's chat route swaps Anthropic for Groq Llama 3.3-70b (free tier); same tool interface, simplified Alex Chen system prompt
- **Mock Gmail + Calendar** — `/api/google/gmail` and `/api/google/calendar` return hardcoded demo data for the demo user; chat tools do the same
- **Nightly reset** — `scripts/reset_demo.py` wipes + reseeds; `/api/cron/reset-demo/route.ts` is `CRON_SECRET`-protected; Vercel cron at 3 AM PT
- **Login UX** — "Try the demo" button auto-fills and signs in when `NEXT_PUBLIC_DEMO_EMAIL/PASSWORD` are set
- **Demo banner** — shown in sidebar (desktop) and above tab bar (mobile) when signed in as demo user
- **Python scripts** — `sync-oura.py`, `sync-fitbit.py`, `sync-googlefit.py`, `fetch_briefing_data.py`, `log_habit.py` now require `OWNER_USER_ID` in `.env` and filter all queries by it
- **`scripts/print_owner_id.py`** — prints owner's Supabase UUID for use as `OWNER_USER_ID`
- **README** — Demo account section (credentials, real vs mocked); Self-Hosting section (rename checklist, env var table, setup steps)

### Added (dismissible suggested nutrition card — issue #123)
- **X button** on `SuggestedNutritionCard` — absolute top-right dismiss button; clicking upserts `nutrition_suggestion_dismissed: "true"` into the `profile` table via the existing `updateAction` server action; disabled state during pending transition
- **Persistent dismissal** — card reads `values["nutrition_suggestion_dismissed"]` on render (server-loaded); returns null immediately if dismissed, surviving page reloads
- **"Recalculate suggested macros" link** — rendered in the Nutrition Goals section header only when the card is dismissed; clicking deletes the `nutrition_suggestion_dismissed` key via `deleteAction`, re-showing the card; spinner shown during pending transition
- No schema migration required — uses the existing key-value `profile` table

### Added (Sleep & HRV by day in Weekly Review — issue #122)
- **Weekly Review Recovery card** renamed from "Recovery Averages" to "Sleep & Recovery"
- **"Sleep by day" row** added below "Readiness by day" — 7-day strip with color-coded score (green ≥80 / yellow ≥60 / red <60) and day number; sourced from `sleep_score` in `recovery_metrics`
- **"HRV by day (ms)" row** added below Sleep — same strip layout, values rounded to nearest integer, colored `var(--color-info)`; sourced from `avg_hrv` in `recovery_metrics`

### Added (MB favicon and iOS touch icon — issue #117)
- **`web/src/app/icon.svg`** — raw SVG monogram logo (solid indigo `#1d4ed8` background, `rx="7"` rounded corners); Next.js App Router auto-wires this as the browser favicon
- **`web/src/app/apple-icon.png`** — 180×180 PNG rasterized from the SVG for iOS Add to Home Screen; solid `#1d4ed8` background, proportionally scaled paths
- **`web/public/manifest.json`** — minimal PWA manifest with `start_url: /dashboard`, `display: standalone`, `theme_color: #1d4ed8`
- **`web/src/app/layout.tsx`** — added `manifest: "/manifest.json"` to Next.js metadata export so browsers and iOS receive the correct `<link rel="manifest">` tag

### Fixed (nutrition goal calculator defaults — issue #114)
- **Default protein option** changed from 0.8 g/lb to 1.0 g/lb; `PROTEIN_OPTIONS` reordered so 1.0 appears first and is selected on first render
- **Disclaimer line** added below the macro preview in `SuggestedNutritionCard` — faint text noting the estimate is based on goal weight only and that Chat gives a more personalized result

### Added (7-day trailing average overlays — issue #112)
- **`trailing7Avg` helper** (`health-breakdown.tsx`) — computes a 7-day trailing average client-side for any `{value: number | null}[]` series; for day N, averages all non-null values in the window [N-6, N]
- **Weight chart** — second `<Line>` overlaid on the existing LineChart; dashed (`4 2`), muted slate color (`#64748B`), no dots, `connectNulls`; legend shows "Weight" + "7d avg"
- **Body Fat chart** — same pattern as weight; overlay on the existing LineChart
- **Steps chart** — `BarChart` replaced with `ComposedChart`; dashed `<Line>` overlaid on the bars; legend shows "Steps" + "7d avg"
- **Active Cal chart** — `AreaChart` replaced with `ComposedChart` (gradient fill preserved); dashed `<Line>` overlaid on the area; legend shows "Active Cal" + "7d avg"
- HRV and RHR charts unchanged (already smooth signals)

### Fixed (habit heatmap bugs — issue #111)
- **Tooltip showed UUID instead of habit name** — `HabitHeatmap` now accepts a `registry: HabitRegistry[]` prop (all habits, including inactive) used exclusively for name lookup; the existing `habits` prop (active only) continues to drive the completion ratio denominator; archived habits whose log entries appear in the window now resolve to their correct names
- **Unchecked habits stayed green on heatmap** — `toggleHabit` server action in `habits/page.tsx` now DELETEs the row on uncheck rather than upserting `completed: false`; eliminates any residual `completed: true` rows that could survive a failed or no-op UPDATE and kept the heatmap cell green

### Added (conversational profile updates — issue #110)
- **`update_profile` tool** (`web/src/app/api/chat/route.ts`) — upserts one or more `{key, value}` pairs into the `profile` table; available alongside `get_profile` in the chat assistant; the AI tells the user what it is about to write before calling the tool and confirms each saved key afterward
- **Canonical key guidance** — system prompt instructs Bridge to use the flat canonical keys (`weight_goal_lbs`, `body_fat_goal_pct`, `weekly_workout_goal`, `weekly_active_cal_goal`, `calorie_goal`, `protein_goal`, `carbs_goal`, `fat_goal`, `fiber_goal`) when writing known fitness/nutrition goals so they surface immediately in the web UI and fitness charts; dot-notation (`sleep.goal.hrs`, `study.goal.mins_per_day`, etc.) for other goal domains
- **Model routing** — added "set my goal", "save my goal", "update my goal", "save that", "lock that in" to Sonnet trigger phrases so goal-setting conversations stay on Sonnet

### Added (ntfy.sh click-through URLs — issue #75)
- **`scripts/notify.sh`** — new `--click-url <url>` argument; when provided, adds an `X-Click` header to the ntfy.sh curl call so tapping the notification opens the web app directly
- **`scripts/check_hrv_alert.py`** — passes `--click-url ${APP_URL}/dashboard` to notify.sh when `APP_URL` is set
- **`scripts/check_weather_alert.py`** — passes `--click-url ${APP_URL}/dashboard`
- **`scripts/check_birthday_notif.py`** — passes `--click-url ${APP_URL}/dashboard`
- **`scripts/check_daily_alerts.py`** — passes `--click-url ${APP_URL}/tasks`
- **`scripts/check_task_due_alerts.py`** — passes `--click-url ${APP_URL}/tasks`
- **`.github/workflows/weekly-review-nudge.yml`** — adds `Click: ${APP_URL}/weekly` header when `APP_URL` GitHub Actions secret is set
- **`.env.example`** — added `APP_URL=https://your-app.vercel.app`; click URLs are skipped gracefully if the variable is absent

### Added (fitness goal progress charts — issue #66)
- **Fitness Goals section in Settings** — four new fields added to `ProfileForm` in a dedicated "Fitness Goals" card: `weekly_workout_goal` (sessions/week), `weekly_active_cal_goal` (kcal/week), `weight_goal_lbs` (target lbs), `body_fat_goal_pct` (target %); stored as profile key-value pairs; inline save/delete matches existing field pattern
- **Suggested Nutrition card** — appears in the "Nutrition Goals" section when both `weight_goal_lbs` and `body_fat_goal_pct` are set; computes macros from fitness goals using: 1 g protein/lb lean mass, 0.4 g fat/lb goal weight, 15× bodyweight calories, carbs fill the remainder; one-click "Apply" populates all four nutrition goal fields via server actions
- **`WorkoutFreqChart`** updated — accepts optional `goal` prop; bars colored green (≥ goal), amber (1 below), red (2+ below) using Recharts `Cell`; dashed `ReferenceLine` at goal; fallback to indigo when no goal set; "Set your goals in Settings →" prompt shown when goal is absent
- **`ActiveCalGoalChart`** (`web/src/components/fitness/active-cal-goal-chart.tsx`) — replaces the old daily `ActiveCalChart` on the fitness page; aggregates `recovery_metrics.active_cal` into weekly totals across last 8 weeks; area chart with dashed goal `ReferenceLine` and tooltip in kcal; "Set your goals" prompt when goal absent
- **`WeightGoalChart`** (`web/src/components/fitness/weight-goal-chart.tsx`) — line chart of `weight_lb` from `fitness_log` over the selected window; dashed goal line at `weight_goal_lbs` with inline label; delta badge top-right showing "X.X lb to go" (green) or "X.X lb above goal" (red) vs latest entry; no-data and no-goal states handled
- **`BodyFatGoalChart`** (`web/src/components/fitness/body-fat-goal-chart.tsx`) — same pattern as WeightGoalChart using `body_fat_pct`; delta badge in % with matching color logic
- **Fitness page updated** — fetches four goal keys from `profile` table in the same `Promise.all`; workout + active-cal charts always show 8-week window regardless of window selector; weight/body-fat charts use the selected window; all four goal charts laid out in 2-column grids below the existing body comp dual chart

### Added (slash command autocomplete — issue #63)
- **`SlashCommandMenu`** (`web/src/components/chat/slash-command-menu.tsx`) — floating suggestion list that renders above the chat input; shows up to 6 commands, scrollable; each row displays the command usage (monospace, primary color) and a short description; keyboard-navigable (↑/↓ arrows, Enter/Tab to select, Escape to dismiss)
- **Autocomplete trigger** — activates when the user types `/` at the start of the input or after a space; filters the list by prefix match as more characters are typed (e.g. `/w` shows `/weekly`, `/workout`, `/weight`)
- **Eight built-in commands** surfaced in the menu: `/weekly`, `/briefing`, `/workout [type]`, `/habit [name]`, `/task [title]`, `/weight [lbs]`, `/meal [description]`, `/journal`
- **Selection behavior** — selecting a command replaces the current slash token with `/command ` (trailing space, no bracket placeholders) and returns focus to the input for argument entry; mouse hover updates the active row; `onMouseDown` prevents input blur so click completes correctly
- **Mobile-safe** — menu is positioned `bottom: 100%` relative to the input wrapper, so it naturally sits above the virtual keyboard when it is open

### Added (daily macro summary — issue #61)
- **`MacroSummaryCard`** (`web/src/components/meals/MacroSummaryCard.tsx`) — server component rendered at the top of `/meals`; queries today's `meal_log` rows (only those with a non-null `calories` value) and profile goal keys; shows per-macro progress bars (calories, protein, carbs, fat) with green/amber/red color coding (green < 85% consumed, amber 85–100%, red > 100%); displays "X left" or "+X over" beside each bar
- **Nutrition Goals section in Settings** — four new fields added to `ProfileForm` in a dedicated "Nutrition Goals" card: `calorie_goal` (kcal/day), `protein_goal`, `carbs_goal`, `fat_goal` (g/day); stored as profile key-value pairs; inline save/delete matches existing field pattern
- **No-goals prompt** — when no goal keys exist in profile, the summary card shows a link to Settings rather than an empty state

### Added (photo context prompt — issue #61)
- **Context field in FoodPhotoAnalyzer** — optional free-text textarea shown before the upload button; content is sent as `prompt` in the FormData and injected into Claude's analysis prompt as "User context"; helps improve macro accuracy when portion size or ingredients are known (e.g. "homemade bowl, ~200g chicken")

### Added (weekly review page — issue #58)
- **`/weekly` page** — server-rendered weekly review at `web/src/app/(protected)/weekly/page.tsx`; fetches the last 7 days from Supabase in a single `Promise.all`
- **Habit completion** — per-habit score (e.g. `5/7`) with current streak and a 7-pill strip showing hit/miss for each day; color-coded green ≥ 6, yellow ≥ 4, red < 4
- **Tasks** — lists tasks completed this week (via `completed_at`), still-active tasks with optional due date, and a red callout for overdue tasks
- **Workouts** — session count, total duration, total calories from `workout_sessions`; per-session list with date, activity, duration, and calories
- **Recovery averages** — average readiness, sleep score, and HRV across available days from `recovery_metrics`; per-day readiness column
- **Body composition delta** — most recent weight and body fat % from `fitness_log` vs the closest measurement at or before the week start; delta rendered green when negative (improvement), red when positive
- **Journal count** — entry count for the week from `journal_entries` with a brief consistency label
- **Nav** — `/weekly` added to `NAV_ITEMS` (desktop sidebar) with `BarChart2` icon; not in `PRIMARY_HREFS` so it appears in the mobile "More" bottom sheet alongside Fitness, Meals, Journal, Settings

### Added (task due push notifications — issue #59)
- **`scripts/check_task_due_alerts.py`** — replaces `check_daily_alerts.py` task alerting; queries active tasks with `due_date <= today`; sends one grouped ntfy.sh notification for overdue tasks and one for due-today tasks; per-task 24-hour deduplication via profile key `task_notif_cache` (JSON dict `{task_id: iso_timestamp}`); only fires when new tasks need notification
- **`scripts/run-syncs.py`** — ALERTS list updated to invoke `check_task_due_alerts.py` instead of `check_daily_alerts.py`

### Changed (agent/rule Supabase cleanup — issue #97)
- **`mr-bridge-rules.md`** — "Pending Tasks" briefing section now references Supabase `tasks` table via `fetch_briefing_data.py`; "Accountability" section references `habits` + `habit_registry` tables via same script; Recovery rules updated to query `recovery_metrics` table (order by date desc, limit 1) instead of `fitness_log.md`; Study Timer Rules updated to use `profile` table for timer state and `study_log` table for duration logging
- **`agents/weekly-review.md`** — replaced all reads of `memory/habits.md`, `memory/todo.md`, `memory/fitness_log.md`, `memory/timer_state.json` with Supabase queries via `_supabase.py`; updated description and Rules section accordingly
- **`agents/nightly-postmortem.md`** — replaced read of `memory/habits.md` with Supabase query of `habits` + `habit_registry` tables; updated description and tools list
- **`agents/study-timer.md`** — timer state now upserted to `profile` table (key = `timer_state`, JSON value) instead of `memory/timer_state.json`; completed sessions inserted into `study_log` table instead of written to `memory/todo.md`; updated description and tools list
- **`commands/stop-timer.md`** — description updated to reference `profile` table for timer state and `study_log` table for log writes
- **`commands/log-habit.md`** — description updated to clarify writes go to Supabase via `log_habit.py`; removed stale reference to `memory/habits.md`

### Removed (migration artifacts — issue #98)
- **`scripts/migrate_to_supabase.py`** deleted — 608-line one-time migration script; Supabase migration (issue #14) is complete
- **`memory/*.template.md`** (5 files) deleted — pre-Supabase scaffolding; all live data is in Supabase tables
- **`.gitmodules`** deleted — empty file; submodule references were converted to git subtrees

### Removed (dead dashboard components — issue #96)
- **15 dead dashboard components deleted** — `briefing-strip`, `daily-insights`, `daily-quote`, `fun-fact`, `weather-card`, `weather-widget`, `recovery-summary`, `recovery-trends`, `hrv-trend-chart`, `inline-sparkline`, `hero-readiness`, `recent-chat`, `fitness-summary`, `sleep-stage-chart`, `habits-summary`; removed from UI in PR #89 but left on disk; zero imports confirmed before deletion
- **`api/daily-quote/`** and **`api/fun-fact/`** route directories deleted; callers removed in PR #89

### Added (chat session history — issue #62)
- **Session history panel** — chat page now shows browsable history of all previous conversations; desktop gets a collapsible ~260px left panel (toggle via History icon in chat header, state persisted in `localStorage`); mobile gets a bottom sheet triggered by the same icon
- **`GET /api/chat/sessions`** — auth-gated route returning all web sessions ordered by `last_active_at` desc, each with a 60-char preview from the first user message; empty sessions are filtered out
- **`GET /api/chat/sessions/[id]`** — auth-gated route returning the last 50 messages for a session; used when switching to a historical conversation
- **`ChatPageClient`** (`components/chat/chat-page-client.tsx`) — client shell managing active session state, history panel toggle, session switching (fetches messages on select), and "New chat"; session list is refreshed after each AI response
- **`SessionSidebar`** (`components/chat/session-sidebar.tsx`) — desktop collapsible panel with "New chat" button pinned at top; sessions grouped by recency with sessions older than 30 days collapsed under an "Older" disclosure; active session highlighted with `--color-primary` left border
- **`SessionSheet`** (`components/chat/session-sheet.tsx`) — mobile bottom sheet matching the existing More sheet pattern (backdrop, close-on-tap, handle bar, `env(safe-area-inset-bottom)` padding)
- **Lazy session creation** — "New chat" generates a UUID client-side without a DB write; the chat API route now upserts the session row on first message, so sessions are only persisted when a conversation actually begins
- **`chat-interface.tsx`** — added optional `onMessageSent` prop (wired to `useChat`'s `onFinish`) so the parent can refresh the session list after each exchange
- **`chat/page.tsx`** simplified — loads the most recent session for the initial render (no longer pre-creates sessions); renders `ChatPageClient` with `initialSessionId` and `initialMessages`

### Added (today's scores strip — issue #92)
- **`TodayScoresStrip` component** — compact single-row card above Health Breakdown showing today's readiness and sleep score fetched separately from the existing card; 2px colored top bar keyed to readiness score; `TODAY` label, color-coded scores with a vertical divider, status text, and `Oura · live · Apr 13` source tag; silently absent when today's row doesn't exist yet
- **Dashboard fetches two recovery rows** — `dashboard/page.tsx` now queries today's `recovery_metrics` row (`date,readiness,sleep_score,source`) in the same `Promise.all` as all other data; strip is hidden when today's date equals the Health Breakdown card's date (late-night sync case) to avoid showing the same data twice

### Fixed (mobile UI + sync — this PR)
- **Weather layout** — date and weather are now on separate lines in the dashboard header; no more mid-line wrapping or diagonal cut-off of the H/L values on narrow screens
- **Mobile nav safe area** — added `viewport-fit: cover` to the viewport metadata and `padding-bottom: env(safe-area-inset-bottom)` to the bottom tab bar so it no longer clips behind the iOS home indicator
- **Bottom nav "More" tab** — replaced the hard-coded 5-item mobile nav with 4 primary tabs (Dashboard, Habits, Tasks, Chat) + a **More** button that opens a bottom sheet with the remaining pages (Fitness, Meals, Journal, Settings); More button highlights when the active page is one of those secondary routes
- **Sync button no longer shows "Sync failed" for unconfigured sources** — Oura, Fitbit, and Google Fit sync routes now return HTTP 200 `{ skipped: true }` when the required env vars or tokens are absent, instead of throwing a 500; only genuine API/DB errors count as failures

### Added (food photo analysis — issue #84)
- **Food photo analysis** — `/meals` page now has an "Analyze Food Photo" card; user selects or captures a photo, Claude vision identifies the dish and extracts an ingredients list with estimated quantities, estimates macros (calories, protein, carbs, fat, fiber, sodium), and presents an editable review before logging
- **Ingredients-first editing** — review state shows dish name as a header and the ingredients list as the primary editable textarea; "Re-estimate macros" button sends the corrected ingredients back to Claude (Haiku) for a fresh macro calculation; macro numbers are shown read-only with an optional "Edit" toggle for manual overrides
- **`/api/meals/analyze-photo`** — POST route; accepts `multipart/form-data` image, sends to `claude-sonnet-4-6` via `generateObject`, returns structured food/macro JSON; image is never written to disk or Supabase Storage
- **`/api/meals/estimate-macros`** — POST route; accepts `{ ingredients }` string, re-estimates macros via `claude-haiku-4-5-20251001`; used by the Re-estimate button in the review flow
- **`/api/meals/log`** — POST route; inserts a full nutrition row into `meal_log` from the client component (bypasses chat)
- **`FoodPhotoAnalyzer`** client component — idle → loading (thumbnail preview) → review → saving → done/error state machine; mobile-optimised: no `capture=` attribute (iOS shows native Take Photo / Photo Library sheet), `font-size: 16px` on all inputs to prevent iOS auto-zoom, `minHeight: 48px` touch targets, 2-column macro grid on mobile, full-width Log Meal button
- **Nutrition columns on `meal_log`** — migration `20260412000000_add_nutrition_to_meal_log.sql` adds `calories`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `sodium_mg`, `source` (all nullable)
- **Macro display in meal log** — meals page shows inline macro summary (`620 cal · P 42g · C 58g · F 14g`) on any entry that has nutrition data
- **`log_meal` chat tool extended** — now accepts optional `calories`, `protein_g`, `carbs_g`, `fat_g` so chat-logged meals can carry macros when the user mentions them or Claude can estimate from the description

### Added (web UI redesign — PR #89)
- **Design system** — `globals.css` now defines all CSS custom properties (`--color-bg`, `--color-surface`, `--color-surface-raised`, `--color-border`, `--color-primary`, `--color-positive`, `--color-warning`, `--color-danger`, `--color-info`, `--color-text`, `--color-text-muted`, `--color-text-faint`); skeleton shimmer keyframe; `prefers-reduced-motion` block disables all transitions and chart animations
- **Typography** — replaced Geist with DM Sans (headings, `font-heading`) + Inter (body); loaded via Google Fonts `<link>` in layout
- **Navigation** — `nav.tsx` rebuilt: 240px fixed sidebar on desktop with indigo active state; bottom tab bar (5 items: Dashboard, Habits, Tasks, Chat, Journal) on mobile; `(protected)/layout.tsx` updated with `ml-0 lg:ml-60` and `pb-16 lg:pb-0`
- **`DashboardHeader`** (`dashboard-header.tsx`) — greeting + inline date/weather (Open-Meteo, no separate card) + single SyncButton + WindowSelector in one row
- **`HealthBreakdown`** (`health-breakdown.tsx`) — replaces `RecoverySummary` + `WeightTrendChart`; full-width card with readiness/sleep/activity scores, 6-up metrics row (HRV, RHR, total sleep, deep, REM, steps), stress/resilience row; two 50/50 tabbed chart panels: **Fitness** (Weight · Body Fat · Steps · Active Cal) and **Sleep** (Stages · HRV · RHR · SpO₂); vertical divider on desktop only; accent top bar keyed to readiness score
- **`WindowSelector`** (`ui/window-selector.tsx`) — pill toggle for 7d/14d/30d/90d/1yr; writes `mb-window` cookie and calls `router.refresh()`; `getWindow()` server helper reads cookie with `DEFAULT_WINDOW = "7d"`
- **`Skeleton`** (`ui/skeleton.tsx`) — shimmer placeholder component; static background when `prefers-reduced-motion` is enabled
- **`MetricCard`** (`ui/metric-card.tsx`) — KPI card with large DM Sans value, delta arrow, `healthPositiveIsDown` awareness
- **`WeightTrendChart`** (`dashboard/weight-trend-chart.tsx`) — standalone Recharts LineChart with optional inline weight/BF stat display in card header
- **`RecentWorkoutsTable`** (`dashboard/recent-workouts-table.tsx`) — compact windowed workout table with "View all →" link
- **Journal redesign** — `journal-editor.tsx` replaces `journal-flow.tsx`; two tabs: Reflect (all 5 prompts visible at once with filled/unfilled progress dots) and Free Write (open textarea with live word count); auto-save debounced 1.5s; `journal-history.tsx` rebuilt as collapsible accordion with entry preview
- **Tasks redesign** — `task-item.tsx`: inline click-to-edit title, relative due dates ("overdue", "today", "in 2d"), 44×44px touch targets, archive button; `add-task-form.tsx`: always-visible inline form, priority dot selector (3 × 32px touch targets), date picker; `completed-tasks.tsx`: new collapsible accordion showing last 10 completed tasks
- **Habits checkin ported to design tokens** — removed all `neutral-*` / `bg-blue-500` Tailwind classes; fixed broken `font-[family-name:var(--font-mono)]` reference (replaced with `tabular-nums`)
- **`TasksSummary`** dashboard widget — shows all active tasks (was capped at 3) with 160px inner scroll; `HabitsCheckin` has 200px inner scroll
- **New pages** — `/dashboard` (dedicated route), `/meals` (stub with recent meal log), `/settings` (profile key-values from Supabase)
- **Fitness page** — new `body-comp-dual-chart.tsx` (dual-axis weight + BF), `workout-freq-chart.tsx` (weekly frequency), `active-cal-chart.tsx` (area chart), `workout-history-table.tsx` (sortable/paginated client component)
- **Habits page** — new `heatmap.tsx` (90-day GitHub-style grid), `streak-chart.tsx` (horizontal bar, sorted by streak), `radial-completion.tsx` (weekly RadialBarChart per habit)
- **Chat** — design token colors on input, send button, message bubbles; `message-bubble.tsx` rebuilt with proper dark-mode rendering

### Changed (web UI redesign — PR #89)
- Dashboard removed: `DailyInsights` fun-fact/quote card, `BriefingStrip` standalone card, `RecentWorkoutsTable` from main dashboard, duplicate `SyncButton` inside `RecoverySummary`, redundant status banner in `RecoverySummary`
- Dashboard `space-y-5` → `space-y-6`; all grids `gap-5` → `gap-6` for consistent rhythm
- `recoveryTrendsRes` query now selects `*` (was selecting subset) so all fields (steps, active_cal, spo2_avg, resting_hr) are available to the new chart tabs
- `fitnessTrendRes` query now includes `body_fat_pct` (was weight-only) to power the Body Fat chart tab

---

### Fixed (pre-redesign)
- `web/src/components/dashboard/recovery-summary.tsx` — scores row changed to `flex flex-wrap` with `gap-x-6 gap-y-3`; status block uses `w-full sm:w-auto sm:ml-auto` to stack below scores on mobile instead of overflowing; stress row changed to `flex flex-wrap` with `gap-x-4 gap-y-1` so Resilience label wraps rather than overflows at 360–414px; closes #83
- `web/src/components/dashboard/trends-card.tsx` — tab/window button header changed to `flex flex-col sm:flex-row sm:items-center sm:justify-between` to prevent overflow at 360–414px; closes #83
- `web/src/components/dashboard/tasks-summary.tsx` — added `min-w-0` to task row flex container so `truncate` on task title clips correctly
- `web/src/components/dashboard/important-emails.tsx` — added `min-w-0` to per-email container so `truncate` on sender/subject lines clips correctly

### Added
- `web/src/app/api/sync/oura/route.ts` — POST endpoint; syncs last 3 days of Oura data (sleep, readiness, activity, spo2, stress, resilience, vo2) into `recovery_metrics`; requires authenticated session; closes #82
- `web/src/app/api/sync/fitbit/route.ts` — POST endpoint; syncs last 7 days of Fitbit body composition and workouts into `fitness_log` and `workout_sessions`; reads rotating refresh token from Supabase `profile` table; writes back new token after each refresh
- `web/src/app/api/sync/googlefit/route.ts` — POST endpoint; discovers datasources then aggregates last 7 days of body composition into `fitness_log`; skips dates already covered by a richer source
- `web/src/app/api/cron/sync/route.ts` — GET endpoint; verifies Vercel `CRON_SECRET`; runs all three syncs in parallel with 30-minute skip window (mirrors `run-syncs.py` logic); each source reports independently so a single failure doesn't block others
- `web/src/lib/sync/oura.ts`, `fitbit.ts`, `googlefit.ts`, `log.ts` — shared sync library; extracted from route files so cron and user-triggered routes share identical logic; `logSync` + `lastSyncAgeSecs` helpers read/write `sync_log` table
- `web/src/components/dashboard/sync-button.tsx` — "Sync" button in the Recovery & Sleep card header; calls all three sync routes in parallel; spinner animation while running; shows "Synced HH:MM" on success; triggers `router.refresh()` to reload server component data without a full page reload
- `web/vercel.json` — Vercel cron schedule (`0 14 * * *`, 6am PST / 7am PDT); calls `/api/cron/sync` daily so overnight Oura/Fitbit/Google Fit data is ready when the dashboard opens; manual Sync button handles on-demand refreshes throughout the day
- `web/src/app/api/chat/route.ts` — `selectModel()`: tiered model routing; simple CRUD commands (add task, log habit, log meal, create event, get recipes, list tasks, check habits) route to `claude-haiku-4-5-20251001`; complex reasoning requests (analysis, planning, recommendations, fitness goals, meal planning, email synthesis) stay on `claude-sonnet-4-6`; zero-latency heuristic classifier — no extra LLM call; logs selected tier to server console per request; closes #81

### Fixed
- `web/src/app/(protected)/page.tsx` — removed `avg_hrv IS NOT NULL` filter from the recovery query; previously, if Oura hadn't finalized HRV when the sync ran in the morning, the card fell back to two-day-old data instead of showing the most recent (partial) row
- `web/src/middleware.ts` — `/api/cron/` routes now bypass session redirect; previously Vercel cron requests were redirected to `/login` before reaching the route handler
- `web/src/components/chat/tool-status-bar.tsx` — inline tool status chips rendered below the last message while Mr. Bridge is working; spinner while tool is executing, ✓ when result arrives, chips disappear when response finishes streaming; reads from `message.parts` (AI SDK v4) with `toolInvocations` fallback; covers all 13 chat tools; closes #64
- `web/src/app/api/chat/route.ts` — `list_calendar_events` tool: queries all Google Calendars for a given date range (defaults to today); events tagged with `calendarType` (primary / birthday / holiday / other) so the model filters noise; declined invitations excluded server-side; closes gap where the model had no way to read the calendar
- `web/src/app/(protected)/chat/page.tsx` — "New chat" link in header; navigating to `/chat?new=1` forces a fresh session with no prior context

### Fixed
- `web/src/app/api/chat/route.ts` — system prompt now includes today's date via `todayString()`; previously the model had no date awareness and passed 2025 dates to calendar tools, returning stale events
- `web/src/app/api/chat/route.ts` — model no longer narrates before tool calls ("Let me grab that now", etc.); pre-tool text and post-tool response were concatenating without a separator in the streamed content
- `web/src/lib/timezone.ts` — added `startOfDayRFC3339(date)`, `endOfDayRFC3339(date)`, `addDays(date, n)` helpers; previous calendar implementation used `toLocaleString → new Date()` for RFC 3339 conversion which produced unreliable timezone offsets

### Changed
- `web/src/app/(protected)/chat/page.tsx` — `initialMessages` now scoped to the current session only; previously loaded across all web sessions, causing stale context to bleed into new chats
- `web/src/app/api/chat/route.ts` — calendar events include `calendarType` field (primary / birthday / holiday / other); model instructed to surface birthdays as reminders and omit holiday calendars by default
- `web/src/components/chat/chat-interface.tsx` — imports and renders `ToolStatusBar`

### Fixed
- `scripts/sync-oura.py` — `daily_activity` end_date is exclusive; changed `end_str` to `now + 1 day` so today's steps/calories are included in the sync
- `scripts/sync-oura.py` — `all_dates` union now includes `activity` dates so today's activity row is written even when readiness/sleep haven't finalized yet

### Added
- `scripts/sync-oura.py` — `fetch_heartrate()`: fetches intraday HR samples via `heartrate` endpoint (start_datetime/end_datetime params), groups by date, stores `hr_avg_day`, `hr_min_day`, `hr_max_day` in `recovery_metrics.metadata`
- `scripts/sync-oura.py` — `fetch_oura_workouts()`: fetches Oura-detected workouts via `workout` endpoint; writes to `workout_sessions` table (source=`oura`) with intensity, distance, MET, and zone breakdown in metadata; deduplicates by clearing oura rows in range before re-insert
- `scripts/sync-oura.py` — `oura_get_datetime()`: new helper for endpoints that use `start_datetime`/`end_datetime` params instead of `start_date`/`end_date`
- `scripts/fetch_weather.py` — Open-Meteo weather helper (no API key); resolves location from profile in order: `location_lat`/`location_lon` → `location_city` (geocoded) → `Identity/Location` (geocoded via Open-Meteo free geocoding API); `fetch_weather()` accepts optional `profile` dict to skip second Supabase round-trip; `format_weather_line()` produces single-line briefing format; closes #77
- `scripts/check_weather_alert.py` — once-per-day push notifications for precip >0.2in, thunderstorm (WMO 95–99), high >95°F, low <28°F, wind >30mph; guard via `weather_alert_last_notified` profile key; closes #77
- `web/src/app/api/weather/route.ts` — Next.js API route; same location resolution logic; 30-minute Next.js cache via `next: { revalidate: 1800 }`
- `web/src/app/api/daily-quote/route.ts` — Claude Haiku motivational quote; cached daily in Supabase `profile` key `quote_cache` so it's stable all day; strips markdown code fences from model output before JSON parsing
- `web/src/components/dashboard/weather-card.tsx` — compact weather block inline with dashboard greeting header; responsive (left-aligned on mobile, right-aligned on sm+); icon color-coded by WMO category; amber border for thunderstorm alert state
- `web/src/components/dashboard/daily-insights.tsx` — replaces separate FunFact and DailyQuote banners with a single combined card; vertical divider on desktop, horizontal divider on mobile; halves top-of-page height on mobile
- `web/src/components/dashboard/daily-quote.tsx` — standalone quote component (used internally by `daily-insights.tsx`)

### Changed
- `scripts/fetch_briefing_data.py` — added `q_weather` to tier1 parallel fetch batch; outputs `## WEATHER` section between PROFILE and ACTIVE TASKS; includes "Rain expected" note when precip >0.1in
- `scripts/run-syncs.py` — `check_weather_alert.py` added to ALERTS list (runs after syncs alongside HRV and task alerts)
- `web/src/app/(protected)/page.tsx` — greeting header refactored to `flex-col sm:flex-row` with `WeatherCard` inline on the right; FunFact + DailyQuote replaced by combined `DailyInsights` card; name lookup now checks both `name` and `Identity/Name` profile keys (fixes name not displaying when profile uses `Identity/Name` key format)
- `.claude/rules/mr-bridge-rules.md` — `### Weather` section added to Session Briefing Format; Location Management section added with chat commands for `location_city` override and reset, and web UI hook note for issue #10

### Added
- `scripts/check_hrv_alert.py` — fires push notification via `notify.sh` when today's HRV drops more than `hrv_alert_threshold`% below 7-day baseline; once-per-day guard via `profile` key `hrv_alert_last_notified`; threshold configurable in Supabase `profile` table (default 20%); closes #60
- `scripts/check_daily_alerts.py` — fires push notification per active task with `due_date <= today`; distinguishes "due today" vs "overdue"; once-per-day guard via `profile` key `task_alerts_last_notified`; closes #59
- `scripts/run-syncs.py` — parallel sync orchestrator; runs `sync-oura.py`, `sync-fitbit.py`, `sync-googlefit.py` concurrently; skips any source synced within the last 30 minutes
- `web/src/app/api/google/calendar/upcoming-birthday/route.ts` — fetches birthdays from Google Calendar over a 60-day lookahead window; returns nearest upcoming birthday with days-until count
- `web/src/components/dashboard/upcoming-birthday.tsx` — dashboard card showing nearest upcoming birthday; closes #76
- `web/src/components/dashboard/trends-card.tsx` — new full-width dashboard card replacing `FitnessSummary`; dual-tab (Body Comp / Recovery) time-series chart with 7d / 30d / 90d window toggle; Body Comp tab shows weight + body fat % on dual axes; Recovery tab shows HRV + readiness on dual axes; recent workout slim row at bottom; closes #72

### Fixed
- `web/src/app/(protected)/fitness/page.tsx` — query was returning oldest 30 records instead of most recent 30; added `.order("date", { ascending: false })` + `.limit(30)` then reversed for chart display
- `scripts/sync-googlefit.py` (`get_credentials`) — removed `scopes=FITNESS_SCOPES` from `Credentials()` constructor; passing scopes during refresh caused `invalid_scope: Bad Request` because Google validates the refresh request body scopes against the original grant; the fix lets the stored refresh token determine its own scope; closes #55

### Changed
- `web/src/app/(protected)/page.tsx` — dashboard greeting now reads `name` key from Supabase `profile` table and displays it in the header (e.g. "Good morning, Jason"); falls back to generic greeting if profile name not set; closes #78
- `web/src/app/(protected)/page.tsx` — replaced `FitnessSummary` (2-col) with `TrendsCard` (full-width row); `ScheduleToday` moved to its own full-width row below; fitness trends query extended to 90 rows ascending; recovery trends query extended from 14 → 90 rows; `RecoverySummary` receives sliced last-14 entries to preserve existing chart label; dropped single-entry `fitnessResult` and `prevFitnessResult` queries
- `.claude/rules/mr-bridge-rules.md` — birthday briefing lookahead extended from 7 to 60 days; briefing now shows only the single nearest birthday regardless of how far out it is

---

### Added
- `.env.example` — root-level environment variable template covering Supabase, Google OAuth, Oura, Fitbit, ntfy.sh, and voice interface; replaces inline README block
- `web/.env.local.example` — Next.js web app environment variable template; documents `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, Google OAuth, and `USER_TIMEZONE` (previously undocumented)

### Changed
- `web/src/app/api/chat/route.ts` — added `providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } }` to `streamText` call; system prompt (~600 tokens) is now cached for 5 minutes, reducing input token cost on every message after the first in an active session
- `web/src/app/api/chat/route.ts` (`get_email_body` tool) — email body now appends `[...email truncated — N more characters not shown]` when content exceeds 4000 chars; Claude can no longer reason about truncated emails as if they are complete
- `scripts/sync-fitbit.py` (`update_env_token`) — token rotation now writes to `.env.tmp` first, then uses `Path.replace()` for an atomic rename; prevents `.env` corruption if the process is interrupted mid-write

---

### Added
- `web/src/app/(protected)/habits/page.tsx` — `addHabit` and `archiveHabit` server actions; range-aware data fetching via `?range=7|30|90` search param (default 30); wires up `HabitTodaySection`, `HabitRangeToggle`; closes #45
- `web/src/components/habits/habit-today-section.tsx` — client component managing manage-mode and add-form state; renders per-habit archive buttons in manage mode; inline add form (emoji, name, category)
- `web/src/components/habits/habit-range-toggle.tsx` — 7d / 30d / 90d pill selector; updates `?range` URL param via Next.js router
- `web/src/lib/timezone.ts` — `getLastNDays(n)` generalizes `getLast7Days`; existing function now delegates to it

### Changed
- `web/src/components/habits/habit-history.tsx` — headers show readable dates (`Apr 5`) instead of single-letter day initials; 90-day view condenses to weekly columns with completion-count badges (opacity-scaled); accepts `range` prop
- `web/src/components/habits/habit-toggle.tsx` — adds optional `manageMode` and `archiveAction` props; renders `✕` archive button at row end when in manage mode
- `get_recipes` chat tool — searches `recipes` table by name or ingredient; returns all saved recipes when no query provided; closes #47
- `log_meal` chat tool — writes to `meal_log` table with meal type (breakfast/lunch/dinner/snack), optional free-text notes, optional recipe UUID link, and date (defaults to today); closes #47
- `Recipe` and `MealLog` TypeScript interfaces in `web/src/lib/types.ts`

### Changed
- `web/src/app/api/chat/route.ts` — system prompt now includes recipes and meal planning as in-scope domains; instructs Claude to check saved recipes, pull fitness context, and include estimated macros with any recipe recommendation; improvises from pantry profile when no saved recipe matches
- `scripts/fetch_briefing_data.py` — added recent meal log section (last 7 days) from Supabase; resolves recipe names for linked entries
- `.claude/rules/mr-bridge-rules.md` — removed `memory/meal_log.md` local read from session start protocol (meals now fetched from Supabase via briefing script); updated data sources table for `recipes` + `meal_log`

---

- `web/src/lib/google-auth.ts` — shared `getGoogleAuthClient()` OAuth2 helper; extracted from duplicated credential setup in dashboard routes
- `search_gmail` chat tool — flexible Gmail search via query string; returns message id, from, subject, date; closes #30
- `get_email_body` chat tool — fetches full message by ID; walks MIME tree; decodes base64url; truncates to 4000 chars
- `create_calendar_event` chat tool — creates timed or all-day events on primary Google Calendar; end_time defaults to start + 2h; returns event link
- `web/src/app/(protected)/journal/page.tsx` — `/journal` protected page; SSR; loads today's entry and last 14 past entries from Supabase
- `web/src/components/journal/journal-flow.tsx` — guided one-prompt-at-a-time journal flow; progress bar (1 of 5); Back/Next/Save navigation; pre-fills existing today's entry for editing; upserts on conflict
- `web/src/components/journal/journal-history.tsx` — past journal entries list grouped by date with prompt labels
- `supabase/migrations/20260411000000_add_journal_entries.sql` — `journal_entries` table: `date` (UNIQUE), `responses` (JSONB keyed by prompt slug), `free_write`, `metadata`
- `.claude/agents/journal-reminder.md` — daily 7 PM reminder agent; checks Supabase for today's entry; sends ntfy.sh notification only if not yet journaled; registered as a remote trigger (`trig_01DHh8vJ1NjGcA9y512bwfKy`) firing at 19:00 PDT
- `docs/gmail-multi-account.md` — setup guide for professional email aggregation via POP3 + App Password; explains Gmail label ID resolution and Calendar sharing steps; closes #11
- `web/src/components/dashboard/recovery-trends.tsx` — HRV/Readiness combo line chart + stacked sleep bar chart (Recharts, 14-day window); displayed full-width above the dashboard grid; closes #35
- `web/src/components/dashboard/inline-sparkline.tsx` — mini Recharts sparkline used inside Recovery and Fitness summary cards

### Changed
- `web/src/components/nav.tsx` — added Journal nav item with `BookOpen` icon pointing to `/journal`
- `web/src/lib/types.ts` — added `JournalEntry` and `JournalResponses` interfaces; `RecoveryMetrics` extended with `light_hrs`, `steps`, `activity_score`, `spo2_avg`, `body_temp_delta`
- `web/src/app/(protected)/layout.tsx` — `max-w-4xl` → `max-w-6xl mx-auto`; centers dashboard content on wide viewports and gives the 3-col bento grid more breathing room; closes #41
- `web/src/components/dashboard/fun-fact.tsx` — moved from bottom ambient strip to top banner; restyled to `bg-neutral-900 border border-neutral-800 rounded-lg` container
- `scripts/sync-oura.py` — extended to pull all available Oura API fields: `light_hrs`, `steps`, `activity_score`, `spo2_avg`, `body_temp_delta` as dedicated columns; `awake_hrs`, `efficiency`, `latency_mins`, `avg_breath`, `avg_hr_sleep`, `restless_periods`, `total_calories`, `stress`, `resilience`, `vo2_max` stored in `metadata` JSONB; graceful 404 handling for optional endpoints (`daily_spo2`, `daily_stress`, `daily_resilience`, `vo2_max`); closes #34
- `supabase/migrations/20260411000001_recovery_metrics_extended.sql` — 5 new columns added to `recovery_metrics`: `light_hrs`, `steps`, `activity_score`, `spo2_avg`, `body_temp_delta`
- `web/src/app/api/google/calendar/route.ts` — queries all calendars (not just primary) so shared calendar events surface; adds `calendarName` + `isPrimary` fields to response; `toLocaleTimeString` now passes `timeZone: USER_TZ` (fixes events displaying in UTC on Vercel); closes #11, closes #44
- `web/src/app/api/google/gmail/route.ts` — adds `account` field to `EmailSummary`; fetches full label list and resolves `"Professional"` label name → opaque label ID before checking (Gmail API returns `Label_XXXXXXXXXX` IDs, not display names — previous string match was never matching); closes #11, fixes #39
- `web/src/components/dashboard/important-emails.tsx` — shows `work` badge on emails from the professional account
- `web/src/components/dashboard/schedule-today.tsx` — shows `calendarName` for non-primary calendar events; past events dimmed, `now` divider between past and upcoming
- `web/src/app/(protected)/page.tsx` — bento grid 3-col lg layout; dynamic greeting (morning/afternoon/evening) + readiness badge in header; recovery card full-width above grid; fetches 14-day recovery trend data in parallel; recovery query filters `avg_hrv IS NOT NULL` to show last complete sync record, not today's partial row
- `web/src/components/dashboard/recovery-summary.tsx` — large readiness/sleep scores (3.25rem/2.5rem), colored accent bar, inline HRV sparkline, status banner
- `web/src/components/dashboard/recovery-trends.tsx` — chart height 100px → 160px; animations enabled
- `web/src/components/dashboard/habits-summary.tsx` — individual per-habit pills (green=done, dim=pending) using habit registry join
- `web/src/components/dashboard/tasks-summary.tsx` — shows top 3 task names with priority-colored left borders + N more count
- `web/src/components/dashboard/fitness-summary.tsx` — TrendingDown/TrendingUp icons on weight and body fat delta values
- `.claude/rules/mr-bridge-rules.md` — session protocol steps 4+5 updated with multi-account coverage notes for Gmail and Calendar

### Fixed
- Added `export const dynamic = "force-dynamic"` to all 5 protected pages (`/`, `/fitness`, `/habits`, `/tasks`, `/chat`) — prevents Next.js data cache from serving stale Supabase responses on page refresh
- Added `export const dynamic = "force-dynamic"` to `web/src/app/api/fun-fact/route.ts` — Next.js was caching the route response, preventing the daily date check and AI generation from running; fun fact now refreshes each day
- `web/src/app/api/google/gmail/route.ts` — professional account detection was silently broken; Gmail label IDs are opaque (`Label_XXXXXXXXXX`), not display names — now resolves label name → ID via the labels list endpoint before filtering

---

## [0.10.0] — 2026-04-10

### Added
- `web/src/components/ui/logo.tsx` — MB monogram SVG logo; used in sidebar header and login page
- `web/src/components/nav.tsx` — replaced fixed bottom nav with a left sidebar: full labels + blue active state on desktop (≥lg), 48px icon-only rail with hover tooltips on mobile; closes issue #27
- `web/src/app/api/fun-fact/route.ts` — calls Claude Haiku (`claude-haiku-4-5-20251001`, max 150 tokens) for a daily surprising fact; caches result in `profile` table as `key='fun_fact_cache'` (JSON `{fact, date}`); regenerates only when date changes
- `web/src/app/api/google/calendar/route.ts` — fetches today's Google Calendar events via `googleapis`; OAuth2 with refresh token; returns `[{time, title, location?}]` sorted by start time
- `web/src/app/api/google/gmail/route.ts` — fetches up to 5 important unread emails (subject filter: meeting / urgent / invoice / action required / deadline); metadata-only fetch for performance; returns `[{from, subject, receivedAt}]`
- `web/src/components/dashboard/fun-fact.tsx` — full-width Fun Fact card with blue left border, spark icon, loading skeleton, italic text
- `web/src/components/dashboard/schedule-today.tsx` — Schedule Today card; client component; fetches `/api/google/calendar`; Geist Mono for times; distinct error state
- `web/src/components/dashboard/important-emails.tsx` — Important Emails card; client component; fetches `/api/google/gmail`; distinct error vs empty states
- `web/src/components/dashboard/recovery-summary.tsx` — Recovery & Sleep card; color-coded readiness/sleep scores (≥80 green, 60–79 amber, <60 red); Geist Mono for HRV, RHR, sleep totals
- `web/src/lib/timezone.ts` — timezone-aware date utilities: `todayString`, `getLast7Days`, `daysAgoString`, `startOfTodayRFC3339`, `endOfTodayRFC3339`; reads `USER_TIMEZONE` env var (default `America/Los_Angeles`)

### Changed
- `web/src/app/(protected)/layout.tsx` — restructured to flex row with sidebar; `ml-12 lg:ml-48` offset; removed `pb-24` bottom nav clearance
- `web/src/app/(protected)/page.tsx` — full daily briefing layout: Fun Fact (full width) + 2-column grid (Schedule/Emails left; Recovery/Fitness/Habits/Tasks right); server fetches recovery and recent workout; date display uses `USER_TIMEZONE`
- `web/src/app/layout.tsx` — replaced Inter with Geist Sans + Geist Mono (`next/font/google`); exposes `--font-sans` and `--font-mono` CSS variables
- `web/src/components/dashboard/fitness-summary.tsx` — added `recentWorkout` prop; shows most recent workout session below body comp; numeric values use Geist Mono
- `web/src/components/dashboard/habits-summary.tsx` — progress bar fill changed to `bg-blue-500`; counts use Geist Mono
- `web/src/components/dashboard/tasks-summary.tsx` — task count uses Geist Mono
- `web/src/components/habits/habit-toggle.tsx` — completed state uses `bg-blue-500` fill with white checkmark (was neutral-100/neutral-950)
- `web/src/components/tasks/add-task-form.tsx` — submit button changed to `bg-blue-500 hover:bg-blue-400 text-white`
- `web/src/components/chat/chat-interface.tsx` — send button changed to `bg-blue-500 hover:bg-blue-400 text-white`
- `web/src/app/login/page.tsx` — added MB logo; sign-in button changed to blue
- `web/src/components/fitness/body-comp-chart.tsx` — weight line changed to `#3b82f6` (blue-500); added `CartesianGrid` with `#262626` (neutral-800) horizontal lines
- `web/src/app/(protected)/habits/page.tsx` — `today` and `getLast7Days` now use `timezone.ts` helpers
- `web/src/app/(protected)/chat/page.tsx` — `today` uses `todayString()` from `timezone.ts`
- `web/src/app/api/chat/route.ts` — `targetDate` defaults and `sinceStr` now use `todayString()` / `daysAgoString()` from `timezone.ts`
- `web/src/app/api/google/calendar/route.ts` — `timeMin`/`timeMax` now use `startOfTodayRFC3339()` / `endOfTodayRFC3339()` with proper SF timezone offset (fixes wrong-day event fetch when server runs in UTC)
- `web/src/app/api/fun-fact/route.ts` — cache date check uses `todayString()` from `timezone.ts`
- `web/src/lib/types.ts` — `RecoveryMetrics` extended with `total_sleep_hrs`, `deep_hrs`, `rem_hrs`, `active_cal` (columns already existed in Supabase schema)
- `scripts/sync-oura.py` — removed `new_dates` guard; script now upserts all dates in range instead of skipping existing rows; fixes partial rows (readiness/sleep score present but HRV/deep sleep NULL) never getting backfilled when Oura's API publishes delayed sleep detail

### Fixed
- Google Calendar API was constructing `timeMin`/`timeMax` from `new Date()` in UTC, causing it to fetch the wrong day's events when server runs in UTC (e.g. Vercel)
- All `new Date().toISOString().split("T")[0]` calls in server components and API routes returned UTC dates, causing off-by-one date errors for SF users after ~5pm local time
- Oura sync silently skipped existing rows on re-run, permanently leaving `avg_hrv`, `resting_hr`, `total_sleep_hrs`, `deep_hrs` as NULL when the first write captured only summary scores (Oura API publishes detailed sleep data hours after readiness/sleep scores)

---

## [0.9.0] — 2026-04-10

### Added
- `web/src/app/api/chat/route.ts` — Vercel AI SDK tool use: 7 Supabase tools (`get_tasks`, `add_task`, `complete_task`, `get_habits_today`, `log_habit`, `get_fitness_summary`, `get_profile`) wired into `streamText` with `maxSteps: 5`; closes issue #19
- `web/src/app/api/chat/route.ts` — overload retry middleware (`wrapLanguageModel`) retries up to 3× with 0/1.5s/3s backoff on Anthropic 529 errors
- `web/src/components/chat/chat-interface.tsx` — error state display with Retry button when API call fails
- `web/src/components/chat/message-bubble.tsx` — markdown rendering via `react-markdown` + `remark-gfm`; tables, bold, headers, lists, and code blocks now render correctly; user bubbles unchanged
- `scripts/_supabase.py` — `urlopen_with_retry()` shared utility: 30s timeout + exponential backoff on HTTP 429/502/503 (up to 3 attempts); imported by all sync scripts
- `scripts/requirements.txt` — pinned Python dependencies for all sync scripts
- `supabase/migrations/20260410170000_study_log_unique_constraint.sql` — unique constraint on `study_log(date, subject)` to prevent duplicate entries inflating weekly review totals

### Changed
- `web/src/app/login/page.tsx` — switched from magic link (`signInWithOtp`) to email/password (`signInWithPassword`) auth; added email format regex validation on submit button
- `web/src/app/api/chat/route.ts` — `maxDuration` increased from 30s to 60s to cover multi-step tool call latency
- `web/src/app/api/chat/route.ts` — `onFinish` skips persisting empty assistant responses; context loader filters empty messages to prevent Anthropic 400 errors
- `web/src/app/api/chat/route.ts` — `onFinish` wrapped in try/catch; DB persist failures are logged instead of crashing silently
- `web/src/app/api/chat/route.ts` — `add_task` tool validates `due_date` format (`YYYY-MM-DD`) before insert
- `web/src/lib/types.ts` — `RecoveryMetrics` interface corrected: `hrv_ms` → `avg_hrv`, `readiness_score` → `readiness` to match actual Supabase schema
- `web/src/app/(protected)/tasks/page.tsx` — `addTask`, `completeTask`, `archiveTask` server actions wrapped in try/catch; return `{ error? }` and surface inline error messages
- `web/src/components/tasks/add-task-form.tsx` — handles `{ error? }` return from server action; displays inline error on failure
- `web/src/components/tasks/task-item.tsx` — handles `{ error? }` return from complete/archive actions; displays inline error
- `scripts/sync-oura.py`, `sync-googlefit.py`, `sync-fitbit.py` — data fetch calls use `urlopen_with_retry`; auth flows get 30s timeout only
- `scripts/sync-renpho.py` — CSV encoding detection: tries `utf-8-sig` → `utf-8` → `iso-8859-1` before failing
- `voice/bridge_voice.py` — `atexit` handler registered to delete temp `.wav` files after transcription; `WAKE_WORD` config used instead of hardcoded `"hey siri"`

### Fixed
- `web/src/app/api/chat/route.ts` — `get_fitness_summary` tool was selecting non-existent columns (`hrv_ms`, `readiness_score`) from `recovery_metrics`; was silently returning nulls

### Chore
- Main branch protection enabled: direct pushes blocked, force pushes disabled, branch deletion disabled
- Issue #10 closed (web interface shipped)

---

## [0.8.0] — 2026-04-10

### Added
- `supabase/migrations/20260410163801_initial_schema.sql` — 14-table PostgreSQL schema: `habit_registry`, `habits`, `tasks`, `study_log`, `fitness_log`, `workout_sessions`, `recovery_metrics`, `recipes`, `meal_log`, `profile`, `sync_log`, `chat_sessions`, `chat_messages`, `timer_state`; every table has a `metadata JSONB` column for extension without schema changes
- `supabase/migrations/20260410164609_add_unique_constraints.sql` — unique constraint on `habit_registry.name`
- `scripts/_supabase.py` — shared Supabase client helper (`get_client`, `upsert`, `log_sync`) used by all scripts
- `scripts/fetch_briefing_data.py` — queries Supabase for all session briefing data (profile, habits, tasks, body comp, workouts, recovery, study log); replaces reading local markdown files at session start
- `scripts/log_habit.py` — logs habit completions directly to Supabase `habits` table; supports fuzzy name aliases
- `scripts/migrate_to_supabase.py` — one-time migration script; parsed all memory markdown files and inserted 325 records into Supabase
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` added to `.env`
- GitHub issue #17 opened: session boot performance (parallel syncs, skip-sync-if-recent, cached briefing)

### Changed
- `scripts/sync-googlefit.py` — rewrites to Supabase-only; removed all markdown write code; deduplicates against `fitness_log` table
- `scripts/sync-oura.py` — rewrites to Supabase-only; deduplicates against `recovery_metrics` table; returns raw numeric values (seconds → hours) instead of formatted strings
- `scripts/sync-fitbit.py` — rewrites to Supabase-only; deduplicates against `workout_sessions` table using `date|start_time|activity` key
- `.claude/rules/mr-bridge-rules.md` — session start protocol updated: sync scripts now write Supabase-only; `Read memory/*.md` steps replaced with `python3 scripts/fetch_briefing_data.py`; memory update rules updated to reflect Supabase as primary store
- `.claude/skills/log-habit/SKILL.md` — simplified to single Bash step calling `log_habit.py`; markdown Edit step removed

### Removed
- Markdown write logic from all three sync scripts
- Markdown write logic from log-habit skill

---

## [0.7.0] — 2026-04-05

### Added
- `scripts/sync-googlefit.py` — pulls weight and workout sessions from Google Fit REST API; deduplicates and appends to `fitness_log.md` Baseline Metrics + Session Log tables
- `scripts/sync-oura.py` — pulls daily readiness, sleep score, HRV balance, and resting HR from Oura REST API v2; writes to new Recovery Metrics section in `fitness_log.md`
- `scripts/sync-renpho.py` — parses Renpho CSV export; writes body fat %, BMI, muscle mass to Baseline Metrics
- `memory/fitness_log.template.md` — Recovery Metrics section added; Baseline Metrics expanded with BMI and Muscle Mass columns
- `docs/fitness-tracker-setup.md` — setup guide for all three sync scripts
- `OURA_ACCESS_TOKEN` added to `.env` template

### Changed
- Google OAuth refresh token regenerated with fitness scopes (`fitness.body.read`, `fitness.activity.read`, `fitness.sleep.read`)
- `scripts/sync-googlefit.py` scoped to weight only — workout tracking removed (unreliable due to background noise)
- `mr-bridge-rules.md` — session briefing now includes Recovery section; Fitness Sync Scripts index updated to include Fitbit
- `docs/fitness-tracker-setup.md` — Fitbit setup instructions added
- Issue #12 updated: phases restructured (Google Fit → Oura → Renpho); issue #2 closed as duplicate

---

## [0.6.0] — 2026-04-05

### Added
- `docs/google-oauth-setup.md` — guide for getting client_id/client_secret, regenerating refresh token, publishing the app to remove 7-day expiry, and automatic token refresh pattern using `google-auth` library
- Google OAuth vars restored to `.env` with explanatory comments (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`)

### Changed
- Issue #10 updated with Google OAuth prerequisite note and setup instructions

---

## [0.5.0] — 2026-04-05

### Added
- `.github/workflows/weekly-review-nudge.yml` — GitHub Actions cron (Sunday 8pm Pacific) that POSTs to ntfy.sh; fires on all devices regardless of local machine state
- `.claude/agents/weekly-review.md` — local agent that computes 7-day habit summary, study totals, task delta, and sends headline push notification
- `.claude/agents/study-timer.md` — timer agent for Japanese and coding sessions; handles forgotten timers with adjustable duration on stop
- `.claude/commands/weekly-review.md` — `/weekly-review` slash command for on-demand review
- `.claude/commands/stop-timer.md` — `/stop-timer` slash command to stop active study timer and log duration
- `memory/timer_state.json` (gitignored) — tracks active study timer state
- `docs/notifications-setup.md` — full setup guide for Android, macOS, and Windows PC via ntfy-desktop
- Study timer rules added to `mr-bridge-rules.md` — offer timer only when explicitly starting a session
- `memory/timer_state.json` added to `.gitignore`

### Changed
- `mr-bridge-rules.md` updated: fix stale submodule command → `bash scripts/update-references.sh`, add timer_state.json to memory index

---

## [0.4.0] — 2026-04-04

### Added
- Gmail and Google Calendar connected via claude.ai hosted MCP servers (authenticated)
- `scripts/notify.sh` updated to send Android push notifications via ntfy.sh (dual macOS + Android)
- `NTFY_TOPIC` added to `.env` template for Android notification setup
- 10 GitHub Issues created tracking full feature backlog
- Session close protocol added to rules: update CHANGELOG + README before every commit

### Changed
- `.mcp.json` cleaned up — removed redundant Gmail/Calendar entries (now handled by claude.ai hosted MCPs), keeping only DeepWiki
- `.claude/settings.json` hooks format fixed (matcher + hooks array)
- MCP tool references in `mr-bridge-rules.md` updated to match actual claude.ai tool names
- Google OAuth credentials removed from `.env` (no longer needed)

### Fixed
- `.claude/settings.json` hooks format was invalid — corrected to use `matcher` + `hooks` array structure

---

## [0.3.0] — 2026-04-04

### Added
- Git submodule: `shanraisshan/claude-code-best-practice` at `.claude/references/best-practice/`
- `scripts/update-references.sh` — pull latest best practices before feature sessions
- `.claude/skills/send-notification/` — reusable macOS notification skill
- `.claude/skills/log-habit/` — reusable habit logging skill
- `.claude/commands/log-habit.md` — `/log-habit` slash command
- `.claude/commands/session-briefing.md` — `/session-briefing` slash command
- `.claude/hooks/scripts/hooks.py` — Python 3 hook handler (PostToolUse memory commit reminder)
- `.claude/settings.local.json` added to `.gitignore`
- Feature branch + PR workflow documented in session rules

### Changed
- Agent files (`nightly-postmortem`, `morning-nudge`) now have full YAML frontmatter
- Hooks restructured from inline shell in `settings.json` to Python script
- `.mcp.json` migrated to standard `npx` stdio format; added DeepWiki MCP server
- `mr-bridge-rules.md` updated with feature development protocol and reference index

---

## [0.2.0] — 2026-04-04

### Added
- Google Calendar + Gmail MCP configuration (`.mcp.json`)
- `.claude/settings.json` with PostToolUse hook for memory commit reminders
- `memory/habits.md` (gitignored) with 7 daily habits: floss, workout, Japanese, coding, reading, water, sleep
- `memory/habits.template.md` — public skeleton for habits tracking
- `scripts/notify.sh` — macOS push notification via `osascript`
- `.claude/agents/nightly-postmortem.md` — scheduled 9pm habit check-in agent
- `.claude/agents/morning-nudge.md` — scheduled 8am session nudge agent
- `voice/` directory: `bridge_voice.py`, `config.py`, `requirements.txt`, `README.md`
  - Architecture: wake word (Porcupine) → STT (faster-whisper) → Claude API → TTS (say / ElevenLabs)

### Changed
- `CLAUDE.md` restructured as lean 2-line bootstrap using `@path` import (best practice)
- Behavioral rules and session protocol moved to `.claude/rules/mr-bridge-rules.md`
- Session briefing updated to include habit accountability summary

---

## [0.1.0] — 2026-04-04

### Added
- Initial project structure: `CLAUDE.md`, `README.md`, `.gitignore`, `memory/`
- `memory/profile.md` (gitignored) — identity, background, preferences, accountability targets
- `memory/fitness_log.md` (gitignored) — goal: fat loss + strength maintenance, Push/Legs/Pull split
- `memory/meal_log.md` (gitignored) — 13 recipes across 6 categories imported from personal cookbook
- `memory/todo.md` (gitignored) — active tasks, daily accountability, study/reading logs
- Public skeleton templates for all four memory files
- Privacy structure: personal memory files gitignored, only templates tracked in repo
- Session bootstrap protocol: load memory → deliver briefing → confirm memory updates → commit/push

---

[Unreleased]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.10.0...HEAD
[0.10.0]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/<your-username>/mr-bridge-assistant/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/<your-username>/mr-bridge-assistant/releases/tag/v0.1.0
