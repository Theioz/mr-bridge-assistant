# Mr. Bridge — Dashboard Design Audit (Baseline)

Captured 2026-04-16 during the Impeccable revamp planning. The CLI scan
(`npx impeccable detect web/src/`) was not run during the audit; re-run from
a permitted shell to fold automated findings into section 3:

```bash
cd "/Users/jason/Code Projects/mr-bridge-assistant"
npx --yes impeccable detect web/src/ --json > docs/design/impeccable-revamp/impeccable-detect.json
npx --yes impeccable detect web/src/                 # human summary
```

---

## 1. Dashboard surface map

**Route entry points**

- `web/src/app/(protected)/page.tsx` redirects `/` → `/dashboard`.
- Canonical surface: `web/src/app/(protected)/dashboard/page.tsx` (server
  component, `force-dynamic`, ~13 parallel Supabase queries).
- App shell: `web/src/app/(protected)/layout.tsx` — `<Nav>` (sidebar on lg,
  bottom tab bar on mobile) + `<main>` clamped to `max-w-6xl mx-auto`.
- Loading skeleton: `web/src/app/(protected)/dashboard/loading.tsx`.

**Render order** (vertical, `space-y-6`)

| # | Component | File | Container |
|---|-----------|------|-----------|
| 1 | `DashboardHeader` (greeting, date, weather, sync, window selector) | `web/src/components/dashboard/dashboard-header.tsx` | flat, no card |
| 2 | Mobile sticky `WindowSelector` | `web/src/components/ui/window-selector.tsx` | sticky strip |
| 3 | `UpcomingBirthdayWidget` (conditional) | `web/src/components/dashboard/upcoming-birthday.tsx` | small inline pill |
| 4 | `TodayScoresStrip` (conditional) | `web/src/components/dashboard/today-scores-strip.tsx` | full-width card, 2px colored top bar |
| 5 | `HealthBreakdown` (readiness + 6 metrics + 2 chart panels w/ tab pills) | `web/src/components/dashboard/health-breakdown.tsx` | full-width card, 3px colored top bar, **nested tinted score sub-card** |
| 6 | `ScheduleToday` (Google Calendar list) | `web/src/components/dashboard/schedule-today.tsx` | full-width card |
| 7 | `TasksSummary` ‖ `HabitsCheckin` (2-col grid) | `web/src/components/dashboard/tasks-summary.tsx`, `habits-checkin.tsx` | identical-shape cards |
| 8 | `WatchlistWidget` ‖ `SportsCard` (2-col grid) | `web/src/components/dashboard/watchlist-widget.tsx`, `sports-card.tsx` | identical-shape cards w/ header bar + scrolling rows |
| 9 | `ImportantEmails` (Gmail) | `web/src/components/dashboard/important-emails.tsx` | full-width card |

**Dead files in the dashboard folder** (not imported by `dashboard/page.tsx`,
candidates for removal):

- `web/src/components/dashboard/recent-workouts-table.tsx`
- `web/src/components/dashboard/trends-card.tsx`
- `web/src/components/dashboard/weight-trend-chart.tsx`

---

## 2. Design tokens summary

Source of truth: `design-system/mr-bridge/MASTER.md` and `web/src/app/globals.css`.
The synced `web/src/design-system/` directory is **empty** (Glob returns nothing).

**Colors (dark default).** Tinted neutrals throughout (`#0B0F19` bg / `#111827`
surface / `#181B24` raised / `#1F2937` border / `#F8FAFC` text / `#94A3B8`
muted / `#64748B` faint). Pure `#FFFFFF` only used for `--color-text-on-cta`
and the light-mode surface (intentional). No pure `#000`. State colors:
positive `#10B981`, warning/cta `#F59E0B`, danger `#EF4444`, info `#38BDF8`,
primary `#3B82F6`. A full set of subtle/strong rgba tints exists for
warning/danger/positive/cta surfaces.

**Typography.** Heading **DM Sans**, body **Inter**, loaded via raw `<link>`
in `web/src/app/layout.tsx:35-38` (no `next/font` — FOUT/perf hazard). MASTER
notes this is "deviation from original Fira spec." `.font-heading` carries a
global `text-shadow: var(--text-glow)` = `0 0 12px rgba(248,250,252,0.3)`
(`globals.css:43, 108`).

**Spacing.** MASTER defines `--space-xs/sm/md/lg/xl/2xl/3xl` (4 → 64px) —
**none of these tokens appear in `globals.css` or any dashboard component**
(grep returns 0 hits). Components use raw `gap-6`/`p-4`/`py-3.5` mixed with
inline `padding: "16px 20px"`. The system is documented but unadopted.

**Shadows / motion / radii.** `--shadow-sm/md/lg`, `--shadow-glow`,
`--text-glow` are defined. **No motion tokens at all** (no easing, no
duration scale) — components inline `duration-150/200/300` ad hoc. **No
radius tokens** — `rounded-lg`/`rounded-xl`/`rounded-md` mixed inline.
`prefers-reduced-motion` is honored globally (`globals.css:188`) and per
chart in HealthBreakdown.

**Other.** `--header-height: 8rem` is declared but referenced nowhere.

---

## 3. CLI detector findings

Not captured. Re-run command above. Predicted hits based on the manual pass
below: `Inter` body font (overused), text-glow on dark headings, repeated
tiny font sizes (10–11px) on stat sublabels, "everything wrapped in a card,"
repeated hero-metric template, faint-on-raised contrast.

---

## 4. Manual critique

### A. Typography — overused fonts + flat hierarchy

- **Inter as body font** (`web/src/app/globals.css:99`). One of Impeccable's
  archetypal "generic SaaS" choices.
- **Global heading glow** — `web/src/app/globals.css:108` applies `--text-glow`
  to `.font-heading`. Low-grade glow accent on dark, exactly the spec
  anti-pattern.
- **Compressed type scale.** Dashboard "big number" sizes: 52 / 40 / 28 / 24
  / 22:
  - Greeting 24px (`dashboard-header.tsx:49`)
  - Tasks count 28px (`tasks-summary.tsx:44`)
  - Habits count 24px (`habits-checkin.tsx:65`)
  - Today scores 22px (`today-scores-strip.tsx:78,101`)
  - Readiness 52px, Sleep/Activity 40px (`health-breakdown.tsx:469,479,490`)

  Five "display" tiers but only one true display (52). Most cards land in
  the same 22–28 band — every section reads at the same volume.
- **Eyebrow label fatigue.** `text-xs uppercase tracking-widest letterSpacing:
  0.07em` repeats on at least 9 sections (`health-breakdown.tsx:455,466,476,
  487,524`; `today-scores-strip.tsx:64`; `tasks-summary.tsx:36`;
  `habits-checkin.tsx:55`; `watchlist-widget.tsx:157`; `sports-card.tsx:238`).
  Identical eyebrow on every card flattens hierarchy further.
- **Body text routinely 13px** (e.g. weather strip at `dashboard-header.tsx:
  56,60`, schedule meta `schedule-today.tsx:138`). Below the 16px lower
  bound — fine for tabular data, risky for reading copy.

### B. Gray-on-tint and low contrast

- **`text-muted` on tinted surface** in the score panel:
  `health-breakdown.tsx:466` puts `var(--color-text-muted)` (`#94A3B8`) on
  `var(--color-positive-subtle)` (~rgba(16,185,129,0.15) over `#111827`).
  Effective contrast borderline, worse on warning/danger tints. Same at the
  Stress row `health-breakdown.tsx:524`.
- **`text-faint` (`#64748B`) on raised (`#181B24`)** ≈ 3.6:1 — fails WCAG AA
  at the 10–11px sizes used. Appears in every empty state
  (`empty-state.tsx:23`) and in muted timestamps across `watchlist-widget.tsx
  :70`, `sports-card.tsx:98,137,146,155`, `today-scores-strip.tsx:64,121`,
  `tasks-summary.tsx:71`.

### C. Card / grid uniformity ("everything is a card")

- **9 of 9 sections are bordered surface cards** with the same `rounded-xl`
  + `1px var(--color-border)` + `var(--color-surface)` recipe
  (`today-scores-strip.tsx:52`, `health-breakdown.tsx:447`,
  `schedule-today.tsx:73`, `tasks-summary.tsx:33`, `habits-checkin.tsx:52`,
  `watchlist-widget.tsx:148`, `sports-card.tsx:230`,
  `important-emails.tsx:30`, `upcoming-birthday.tsx:46`). No section escapes
  the container.
- **Two identical 2-col grids stacked.** `dashboard/page.tsx:260`
  (Tasks/Habits) and `:272` (Watchlist/Sports) both `grid-cols-1 lg:grid-cols-2
  gap-6` with same-shape cards. Reads as "card, card, card, card" — no
  asymmetry, no spanning, no negative space.
- **Card-in-card.** `health-breakdown.tsx:462` is a tinted, bordered, rounded
  sub-card *inside* the outer card. The metric grid (`:509`) is yet another
  sub-region. Health Breakdown has 7 nested visual layers in one unit.

### D. Side-stripe / colored-bar accents

- `TodayScoresStrip` paints a 2px colored top bar keyed to readiness
  (`today-scores-strip.tsx:55`). `HealthBreakdown` paints a 3px equivalent
  (`health-breakdown.tsx:451`). Within tolerance individually, but doubling
  the device weakens both.
- `Schedule Today` "now" divider is a primary-blue rule with `opacity: 0.3`
  (`schedule-today.tsx:101`) — fine, but yet another colored-line accent.
- The only true side stripe is the `lg:border-l` between Fitness and Sleep
  chart panels (`health-breakdown.tsx:562`), which is just a 1px column
  divider — within spec.

### E. "Hero metric" template, repeated

- Same big-number-then-label pattern in: Readiness 52 + Sleep 40 + Activity
  40 (`health-breakdown.tsx:462–506`); Tasks 28 + chips
  (`tasks-summary.tsx:43–54`); Habits 24 + bar
  (`habits-checkin.tsx:62–82`); Today scores 22 + 22 + status
  (`today-scores-strip.tsx:71–116`). Four hero blocks in one scroll, all
  making the same shape of statement.

### F. Sparkline as decoration

- Watchlist sparkline (`watchlist-widget.tsx:76–93`) is 80×32 with no axis,
  no scale, no last-point marker, no tooltip (`isAnimationActive={false}`).
  Pure ornament — the spec calls this out.

### G. Spacing rhythm

- Outer rhythm uniform `space-y-6` (24px) between every section
  (`dashboard/page.tsx:220`).
- Card padding drifts: most `p-4` (16px), Health Breakdown `p-5` + internal
  `gap-5`, Watchlist/Sports header `px-5 py-3.5`. None of the inline values
  reference MASTER's `--space-*` tokens.
- `gap-6` between paired cards equals `space-y-6` between sections —
  horizontal seam reads at the same weight as vertical, weakening the "this
  row groups" signal.

### H. Touch targets

- Habit checkboxes are 16×16 inside a `py-1.5 px-1.5` button ≈ 28px tall
  (`habits-checkin.tsx:101–115`). Under 44px.
- `WindowSelector` buttons `px-2.5 py-1` ≈ 28px tall
  (`window-selector.tsx:37`). Same on `TabPills` (`health-breakdown.tsx:155`).
- Watchlist/Sports refresh buttons `px-2.5 py-1` ≈ 24px
  (`watchlist-widget.tsx:165`, `sports-card.tsx:247`). `SyncButton` ≈ 18px
  tall (`sync-button.tsx:65–99`). All under 44px on touch.
- Mobile bottom-tab targets ARE 56px (`nav.tsx:205`) — fine.

### I. Body width / line length

- `<main>` clamps at `max-w-6xl mx-auto` ((protected)/layout.tsx:45) —
  1152px. No inner reading column. Email snippets
  (`important-emails.tsx:75–91`) and event titles can stretch the full card
  width. With 13–14px body on 1100+px wide cards, line length easily exceeds
  75ch even with truncation.

### J. Other

- **Inline `style={{ … }}` dominates.** Tailwind handles only layout;
  theming is enforced by convention, not class composition.
- **Three sync affordances** — header `SyncButton` (`sync-button.tsx`) +
  Watchlist Refresh (`watchlist-widget.tsx:162`) + Sports Refresh
  (`sports-card.tsx:244`) — three different visuals.
- **Theme parity gap.** Many color choices are dark-tuned only (`text-glow`
  is dark-only by design; `card-lift` shadow tuned for dark; static greens/
  ambers in standings/emails have no explicit light variant).
- **Three competing "small inline status" patterns near the top**: weather
  line, sticky window selector, birthday widget.
- `--header-height: 8rem` declared but never referenced.

---

## 5. Quick wins vs structural changes

### Quick wins (token / 1-line diffs)

1. Drop the global heading glow at `globals.css:108`.
2. Collapse the 5-tier display scale (52/40/28/24/22) to ~3 tiers — promote
   one display, demote the rest.
3. Lift `--color-text-faint` to ~`#7B8AA1` for 4.5:1 on raised, OR stop using
   it for anything below 14px.
4. Bump `WindowSelector`, `TabPills`, refresh/sync buttons, and habit
   checkbox hit areas to `min-height: 44px` on touch.
5. Remove the per-card eyebrow on at least half the sections — reserve for
   genuine groupings.
6. Switch font loading to `next/font/google` to remove FOUT and self-host
   woff2.
7. Delete or relocate the unused `recent-workouts-table.tsx`,
   `trends-card.tsx`, `weight-trend-chart.tsx`.
8. Wire MASTER's `--space-*` tokens into `globals.css` and use them — or
   strip them from MASTER if aspirational.

### Structural changes (need a redesign pass)

1. **Break the all-cards rhythm.** Make Health Breakdown the only true card;
   let secondary sections live as bordered rows / inline sections /
   typographic blocks. Or move to a 12-col grid with intentional spans
   (Tasks 7/12, Habits 5/12) instead of 50/50 every time.
2. **Replace Inter** with something less ubiquitous (Geist, Söhne, IBM Plex
   Sans, Manrope) or pair a serif body (Source Serif, Newsreader) for
   briefing copy.
3. **Re-frame the briefing as a briefing.** The CLAUDE.md briefing format is
   a written document. The web surface translates it into nine equal cards.
   Lead with a typeset briefing block (text + small inline numbers) and let
   charts/cards live below as supporting detail. Order today (charts before
   schedule) inverts the assistant's voice.
4. **Kill three of the four hero-metric blocks.** Reserve the template for
   one (Readiness). Tasks/Habits/Today scores → integrated typography that
   reads like the assistant talking.
5. **Sparkline rethink.** Add scale + last-point + change encoding, or
   remove.
6. **Consolidate refresh.** One header status — "last synced 12:14 — refresh"
   — that triggers all data sources, replacing three local buttons.
7. **Mobile-first reading column.** Inside `max-w-6xl`, introduce
   `max-w-prose` for sentence content (Emails, Schedule, Birthday).
8. **Adopt motion tokens** (`--motion-fast/base/slow`,
   `--ease-standard/emphasised`) and bind every transition to them.
9. **Theme parity audit.** Walk every inline `style={{ color: … }}` for
   light-mode legibility — especially low-alpha greens/ambers on light
   surfaces.
