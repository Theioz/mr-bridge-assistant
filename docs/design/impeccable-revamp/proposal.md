# Mr. Bridge — Impeccable-driven UI revamp

> **HARD CONSTRAINT — STRICTLY UI.** No UX changes. No functionality removed,
> renamed, hidden, reordered, or altered in behavior. Every existing route,
> data flow, interaction, command, and feature is preserved exactly. This is
> a visual + structural rebuild only — fonts, colors, spacing, motion,
> layout vocabulary, background texture, chart styling. If a change requires
> touching `dashboard/page.tsx`'s Supabase queries, an API route, or any
> component's behavior, it is out of scope for this issue.

## Vision

Use [Impeccable](https://github.com/pbakaus/impeccable) (anti-pattern detection
+ steering commands) to revamp the entire Mr. Bridge web app from a stack of
identically-styled bordered cards into a refined-minimal, document-like
surface that honors the CLAUDE.md voice ("direct, structured, high-density,
no filler, no emojis, no motivational language").

Aesthetic direction: **quiet, precise, dependable** — Linear and Cultured
Code (Things 3 / Bear) as references; explicitly avoiding generic SaaS-
dashboard tropes (purple gradients, big-number cards, persistent sidebar
chrome) and crypto-terminal tropes (neon, monospace-everywhere, glow
accents).

Full design context: [`/.impeccable.md`](../../../.impeccable.md).
Full audit baseline: [`audit-baseline.md`](audit-baseline.md).
Worked exemplar (open in browser): [`dashboard-mockup.html`](dashboard-mockup.html).

---

## Scope — surfaces in this revamp

All 11 user-facing routes plus shared chrome. Each gets its own audit pass
during implementation; the dashboard mockup is the worked exemplar of the
universal vocabulary applied to one surface.

| Route | File | Notes |
|---|---|---|
| Dashboard | `web/src/app/(protected)/dashboard/page.tsx` | Worked exemplar — see [mockup](dashboard-mockup.html) and audit. |
| Chat | `web/src/app/(protected)/chat/page.tsx` | Plus session list + message thread surfaces. |
| Journal | `web/src/app/(protected)/journal/page.tsx` | |
| Tasks | `web/src/app/(protected)/tasks/page.tsx` | |
| Habits | `web/src/app/(protected)/habits/page.tsx` | |
| Meals | `web/src/app/(protected)/meals/page.tsx` | |
| Fitness | `web/src/app/(protected)/fitness/page.tsx` | Deep-dive trends home. Receives the full chart system. |
| Weekly | `web/src/app/(protected)/weekly/page.tsx` | |
| Notifications | `web/src/app/(protected)/notifications/page.tsx` | |
| Settings | `web/src/app/(protected)/settings/page.tsx` | |
| Login | `web/src/app/login/page.tsx` | Sets first impression — gets the same typography + texture treatment. |
| Nav shell | `web/src/app/(protected)/layout.tsx`, `web/src/components/layout/nav.tsx` | Sidebar (desktop) + bottom tabs (mobile). Restyle, do not restructure. |
| Loading skeletons | `*/loading.tsx` files | Use the same tokens, hairline rules, no shimmer-as-decoration. |
| Empty states | `web/src/components/ui/empty-state.tsx` | Teach the interface, not "nothing here." |

---

## Universal design system (applies to every surface)

### 1. Typography
- **Replace** `Inter` (body) + `DM Sans` (headings) with **Hubot Sans**
  (display) + **Mona Sans** (body/UI). Both are free, on Google Fonts,
  designed to pair, and outside Impeccable's reflex-reject list.
- Switch font loading to `next/font/google` — eliminates FOUT and self-hosts
  woff2.
- **Drop** the global heading text-glow at `web/src/app/globals.css:108`.
- Collapse the 5-tier display scale (52 / 40 / 28 / 24 / 22) to **3 tiers
  with conviction** — one true display (`clamp(3.25rem, 4.5vw + 1.25rem,
  4.5rem)`), one h1 (~1.875rem), then meta + micro. Min 1.25 ratio between
  steps.
- `font-variant-numeric: tabular-nums` everywhere a number lives next to
  another number.
- Remove the eyebrow label from any section that doesn't earn one (currently
  all 9 dashboard sections use it).

### 2. Color
- **OKLCH throughout.** All color values use `oklch()`.
- Neutrals tinted toward graphite-blue (hue 240, chroma 0.005–0.018). Same
  hue on both themes, only lightness flips.
- **Single accent:** muted amber. Light: `oklch(62% 0.13 65)`. Dark:
  `oklch(74% 0.14 70)`. Reserved for items requiring attention (overdue
  tasks, action-required emails, today markers, focus rings). Rarity gives
  it power — never decorative.
- No pure black, no pure white anywhere.

### 3. Background
- **Subtle SVG noise grain** (paper texture) — fixed-position
  `feTurbulence`-generated grain at ~6% alpha, blended via `mix-blend-mode`
  (multiply on light, screen on dark). Adds depth without color.
- **Watercolor pigment-cloud abstraction** — five soft elliptical brand-hue
  shapes pushed through `feTurbulence` + `feDisplacementMap` for organic
  flow. Layered, low opacity, blended. Anchored to viewport. Does not
  compete with chart vocabulary.
- Both layers adapt to light/dark via blend mode + alpha.

### 4. Layout vocabulary
- **Cards only when grouping genuinely needs them.** Not by default.
  Replace the "everything wrapped in a card" pattern with flat sections,
  hairline rules between groups, and asymmetric splits where two things
  belong side-by-side.
- **Asymmetric splits** (e.g. Tasks 7/12 + Habits 5/12) instead of 50/50
  whenever paired sections have different content shapes.
- **Reading column** (`max-w-prose`, ~62ch) for sentence content (briefing
  copy, email snippets).
- **Container queries** for components that should adapt to their column
  width, not the viewport.

### 5. Chart system
A shared chart vocabulary applied to every surface that shows data over time
(dashboard mini-trends + the entire `/fitness` deep-dive page).

- Primary line: **1.5px stroke** in `--text`.
- Reference lines: **1px hairline** in `--rule`, dashed (averages, targets,
  thresholds).
- Today: **3px filled dot** in `--accent` with a soft 6px halo ring; tabular
  value labeled inline in the chart header.
- Stacked bars: same hue at three opacity steps (Deep 85% / Core 45% /
  REM 18%).
- Today's bar: **hairline outline** in `--accent`, never filled with a
  different color.
- Axes: **implicit**. Endpoints labeled only ("Apr 03" / "Today").
- All numeric labels: **tabular figures**, 13px or smaller, `--faint`.
- Implementation: style the existing **Recharts** components (already used
  in `health-breakdown.tsx`) to match. If Recharts can't go hairline-thin,
  swap to minimal SVG primitives.

### 6. Tokens
- **Wire MASTER's `--space-xs/sm/md/lg/xl/2xl/3xl`** — currently defined at
  `design-system/mr-bridge/MASTER.md`, **0 grep hits in any component**.
  Adopt across every surface. Strip inline `padding: "16px 20px"` literals.
- **Add motion tokens:** `--motion-fast: 120ms`, `--motion-base: 220ms`,
  `--motion-slow: 360ms`, `--ease-out-quart`, `--ease-out-quint`. Bind every
  transition to them — no inline `duration-150`.
- **Add radius tokens:** `--r-1: 4px`, `--r-2: 8px`.
- **Drop** `--header-height: 8rem` (declared, never referenced).

### 7. Motion
- Page-load orchestration: ~60ms stagger × N sections, opacity +
  translateY only, total under 500ms.
- Hover/focus transitions: 120–180ms ease-out-quart.
- Never animate layout properties. Transform + opacity only.
- No bounce, no elastic.
- `prefers-reduced-motion: reduce` strips all reveal animation.

### 8. Touch targets
Every interactive surface ≥ 44px on touch. Specifically affected (per audit):

- `WindowSelector` ([window-selector.tsx:37](../../../web/src/components/ui/window-selector.tsx#L37)): 28px → 44px
- `TabPills` ([health-breakdown.tsx:155](../../../web/src/components/dashboard/health-breakdown.tsx#L155)): 28px → 44px
- Habit checkbox ([habits-checkin.tsx:101-115](../../../web/src/components/dashboard/habits-checkin.tsx#L101-L115)): 28px → 44px
- `SyncButton`, Watchlist refresh, Sports refresh: bring to 44px or
  consolidate into a single header sync (no UX change — same Refresh action,
  same affordance count or fewer).

### 9. Accessibility
- WCAG **AA** at every text size on both themes. AAA where it doesn't fight
  the aesthetic.
- Lift `--color-text-faint` so AA passes at 13px on raised surfaces.
- Visible focus ring on every interactive surface (uses `--accent`).
- Reduced-motion respected (see motion).

### 10. Cleanup (no UX impact)
- Delete dead files in `web/src/components/dashboard/` not imported anywhere:
  - `recent-workouts-table.tsx`
  - `trends-card.tsx`
  - `weight-trend-chart.tsx`
- Delete `--header-height: 8rem` (unused token).

---

## Per-surface plans

The dashboard plan below is fully detailed (it's the worked exemplar). Other
surfaces apply the universal system + their own per-surface audit during
implementation. The audit follows the same script as
[`audit-baseline.md`](audit-baseline.md): surface map → tokens used → CLI
detector findings → manual critique → quick wins vs structural.

### Dashboard (worked exemplar)

See the [mockup](dashboard-mockup.html) — open in a browser, toggle Auto /
Light / Dark, resize to confirm responsive. Layout, block by block:

| Block | Form | Notes |
|---|---|---|
| Masthead | Brand + timestamp + theme toggle (toggle is dev-only, lives in Settings in production). Hairline rule below. | No card. |
| Greeting + briefing copy | Typeset paragraph (~62ch). | The assistant's written voice, mirrored in the UI. |
| Birthday row | Conditional inline row, accent dot, name + relative time. | Renders only when birthday in next 7 days (matches CLAUDE.md rule). |
| Focal: Readiness | Display number + supporting metrics inline (sleep, total, hrv, rhr, trend). | One true hero. No card. |
| Body & Fitness · 7-day average | Four cells: Weight · Body fat · Steps · Active cal. Each shows 7-day average as headline, today's value as supporting comparison with delta, and a tiny inline 7-point trendline. | High-level snapshot only. Deeper trends live on `/fitness`. |
| Schedule | Flat list, hairline rules. | No card. |
| Tasks ⏐ Habits | Asymmetric 7/12 + 5/12 split (was 6/6). Container queries per panel. | No cards. |
| Inbox | Flat list. Attention pin (amber dot) only on items requiring action. | No card. |
| Reference (Watchlist + Sports) | Two-column below the fold, smaller type, hairlines. | Not morning-briefing critical. |
| Footer | Single sync status + single refresh action. | Replaces 3 competing sync buttons. Same data refresh behavior. |

### Other surfaces (audit during implementation)

Each surface audited and rebuilt against the universal system. The
constraint everywhere: **no UX change, only visual + structural rebuild.**

- **Chat** — message thread restyled with refined typography, tabular
  timestamps, hairline session-list rules. Streaming/voice UX preserved.
- **Journal** — entries laid out as document-like reading column.
- **Tasks** — task list using the dashboard's `tasks-list` vocabulary.
- **Habits** — full habit grid using the dashboard's `habit-row` vocabulary
  scaled up.
- **Meals** — meal log restyled, recipes restyled.
- **Fitness** — receives the full chart system. Deep-dive: Weight 30/60/90d,
  Body fat 30d, Muscle 30d, HRV 30d, RHR 30d, Sleep stages 7d, Sleep total
  14d, Sleep efficiency 14d, Activity 7/30d, Workout sessions list. Tabbed
  per metric or laid out as a long scroll — design pass during
  implementation.
- **Weekly** — restyled.
- **Notifications** — restyled.
- **Settings** — restyled. Theme override (Auto / Light / Dark) lives here.
- **Login** — refined typography + watercolor texture set the first
  impression.
- **Nav shell** — sidebar (desktop) and bottom tabs (mobile) restyled with
  the universal palette + typography. Same nav items, same routes, same
  behavior.

---

## Phasing & gates

Two milestones, two dev-server preview gates. The first gate is the
"scrap-or-continue" decision; the second is the "ship-or-refine" decision.

### Phase A — Universal system + dashboard

**PR scope:**

1. Universal system applied repo-wide:
   - Token additions (motion, radius), spacing token adoption
   - Font replacement (Mona + Hubot via `next/font/google`)
   - OKLCH palette, accent rationalization
   - Watercolor + noise grain background components
   - Chart-system tokens + base SVG primitives
   - Touch target lifts
   - Drop `text-glow`, lift `text-faint`, dead-file cleanup
2. Dashboard rebuilt to match the [mockup](dashboard-mockup.html).
3. Other surfaces continue rendering correctly with new tokens (visually
   updated typography + palette but layout unchanged from current).

**Gate A — Dev-server preview before merge.** Jason runs `npm run dev`,
opens the dashboard in both themes on desktop and mobile. **Decision: ship
the universal system + dashboard and proceed to Phase B, OR scrap Impeccable
entirely.** No merge before this gate.

### Phase B — Per-surface revamp

**PR scope:** Each remaining surface rebuilt against the universal system.
Recommend one PR per surface (10 PRs) for review-ability, or 2–3 grouped PRs
if cohesive (e.g. all health surfaces together).

**Gate B — Dev-server preview before merge of the final PR.** Jason reviews
all surfaces on desktop and mobile, both themes. **Decision: ship the full
revamp OR refine.**

---

## Acceptance criteria

- [ ] **No UX regressions.** Every existing route, data flow, interaction,
      command, and feature works identically. Manual smoke-test checklist
      committed alongside the final PR.
- [ ] `npx impeccable detect web/src/` baseline + post-revamp scores
      committed under `docs/design/impeccable-revamp/`.
- [ ] Both themes pass WCAG AA at every text size on every surface.
- [ ] Every interactive surface ≥ 44px on touch.
- [ ] No regressions in existing UI issues (#258, #259, #267, etc. from the
      open list — verify each).
- [ ] Spacing/motion/radius tokens wired into `globals.css`; zero inline
      `padding:` literals or `duration-NNN` in revamped components.
- [ ] CHANGELOG entry per phase summarizing visible UX changes.
- [ ] **Gate A: Dev-server preview of universal system + dashboard before
      merge.** Decision recorded in PR description.
- [ ] **Gate B: Dev-server preview of all surfaces before final merge.**
      Decision recorded in PR description.

---

## Reference materials

- **Design context:** [`/.impeccable.md`](../../../.impeccable.md)
- **Audit baseline:** [`audit-baseline.md`](audit-baseline.md)
- **Dashboard mockup:** [`dashboard-mockup.html`](dashboard-mockup.html)
  (open in browser)
- **Impeccable:** https://github.com/pbakaus/impeccable
- **CLAUDE.md briefing format:** referenced for voice consistency

---

## Out of scope

- New features on any surface (file separately).
- Backend / Supabase changes.
- API route changes.
- Voice mode behavior changes (voice mode rules in CLAUDE.md are honored
  as-is).
- Mobile app shell beyond what's already in `web/`.
- The `/fitness` page's data model — design uses existing Supabase queries
  only.
