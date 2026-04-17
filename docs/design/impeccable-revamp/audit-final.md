# Impeccable revamp — Gate B audit (final)

Issue: [#272](https://github.com/Theioz/mr-bridge-assistant/issues/272)
Date: 2026-04-17
Phase B PRs merged: #297 #298 #299 #300 #301 #306 #307 #308 #312 #313 #314 (+ polish #316, habits #318, meals #320, logo #321)

---

## 1. Mechanically verified (autonomous audit)

### 1.1 Preflight
- `git pull --ff-only` — up to date with `origin/main`.
- `bash scripts/update-references.sh` — completed; best-practices reference refreshed (tip asset directory renamed to new `YY-M-DD` convention).
- `cd web && npm run build` — **clean**. 31/31 static pages generated, no TypeScript/lint errors, no warnings.

### 1.2 Impeccable detector
| Snapshot | Antipatterns | Breakdown |
|---|---|---|
| Baseline (pre-revamp) | 6 | — |
| Post-Phase A | 4 | 3× bounce-easing (chat-interface.tsx), 1× layout-transition (session-sidebar.tsx) |
| **Post-Phase B** | **0** | **clean sweep** |

Phase B Chat rewrite (#298) eliminated all four Phase-A residuals. Full JSON: `impeccable-detect-post-phase-b.json`.

### 1.3 Per-route bundle size (First Load JS) — after fix
| Route | Size | Under 200 kB? |
|---|---|---|
| `/` (root redirect) | 102 kB | ✓ |
| `/login` | 166 kB | ✓ |
| `/chat` | 188 kB | ✓ |
| `/dashboard` | **121 kB** | ✓ (was 220 kB — fixed, see §4) |
| `/fitness` | 121 kB | ✓ |
| `/habits` | 114 kB | ✓ |
| `/journal` | 106 kB | ✓ |
| `/meals` | 114 kB | ✓ |
| `/notifications` | 109 kB | ✓ |
| `/settings` | 110 kB | ✓ |
| `/tasks` | 107 kB | ✓ |
| `/weekly` | 102 kB | ✓ |

All 11 routes under 200 kB. Dashboard's 99 kB drop came from eliminating Recharts — see §4.

### 1.4 Best-practices grep sweep

| Rule | Expected | Actual | Notes |
|---|---|---|---|
| Inline `padding:` / `margin:` px literals in `.tsx` | 0 | **0** ✓ | |
| `rgb(` in `.tsx` | 0 | **0** ✓ | |
| Hex colors in `.tsx` | 0 (outside allowlist) | **2** ✓ | `logo.tsx` (#261C13 rect fill — allowlisted in token-lint) + `layout.tsx` `themeColor: "#261C13"` (PWA manifest requires literal). All other apparent matches are `#302`/`#303`/`#304`-style issue refs in comments — false positives. |
| `text-shadow` / `textShadow` in `.tsx`+`css` | 0 (except reset) | **1** ✓ | `globals.css:502` `text-shadow: none !important;` — intentional heading-glow reset from Phase A. |
| `next/font` imports in `.tsx` | only `layout.tsx` | **1 file** ✓ | `layout.tsx:2` imports `Mona_Sans, Hubot_Sans` — correct. |
| `Inter` / `DM Sans` imports anywhere | 0 | **0** ✓ | |
| Dead files deleted (`recent-workouts-table`, `trends-card`, `weight-trend-chart`) | absent | **absent** ✓ | |
| `--header-height` token | removed | **removed** ✓ | |
| `--space-*` token usage | ≫ 0 (was 0 at baseline) | **572 occurrences** ✓ | Space tokens now wired throughout. |
| Recharts import sites | 0 | **0** ✓ | Watchlist migrated to inline SVG sparkline — see §4. Package uninstalled. |
| `duration-NNN` Tailwind classes in revamped components | **0** per proposal | **0** ✓ | 8 drifts retired across 6 files — see §4. |

### 1.5 Motion-token drift — fixed
All 8 call sites across 6 files retokenized to explicit `transition: ... var(--motion-fast|base|slow) var(--ease-out-quart)`. Zero `duration-NNN` remain in `.tsx`. Details in §4 and CHANGELOG.

### 1.6 Touch-target static inspection
No explicit `min-h-[44px]` / `min-w-[44px]` / `min-height: 44px` markers in component source. Touch-target compliance is enforced via **padding patterns** (e.g. `py-3 + px-4` → 48 px effective) rather than explicit min-heights, so this cannot be auto-verified. See §2.3 below for manual verification requirement.

---

## 2. Requires manual verification (browser + human judgment)

These dimensions of the Phase B acceptance gate **cannot be executed autonomously** from the CLI. Each is required to close the gate; flagged here for human execution.

### 2.1 Accessibility per route — axe-core
Run axe against each of: `/dashboard`, `/chat`, `/journal`, `/tasks`, `/habits`, `/meals`, `/fitness`, `/weekly`, `/notifications`, `/settings`, `/login`.

### 2.2 Accessibility per route — WCAG AA at 13/11/10 px, both themes, manual
Small text (eyebrows, metric-row labels, endpoint labels) on raised surfaces must clear 4.5:1 in both themes. #316 already lifted `--color-text-muted` + `--color-text-faint` tiers; verify no regressions remain.

### 2.3 Touch targets — manual sweep
DevTools mobile viewport on each of the 11 routes. Confirm every button / link / input / toggle ≥ 44 × 44 px. Particularly watch: `WindowSelector` pills, theme-override pills, watchlist / favorite-team `X` remove buttons, habit icon picker (now 32 × 32 — verify clickable region).

### 2.4 Performance
- `ANALYZE=true npm run build` → treemap. Confirm `/dashboard` bloat is still Recharts.
- Lighthouse mobile + desktop on all 11 routes: CLS < 0.1, LCP < 2.5 s, INP < 200 ms.

### 2.5 Cross-browser
- Safari 17+ (OKLCH handling — critical)
- Firefox latest
- Chromium latest
- iOS Safari on real device (watercolor `feTurbulence` / `feDisplacementMap` performance)

### 2.6 Theme-switch smoke
Auto / Light / Dark toggle on every route — no flash, no broken colors, no regressions.

### 2.7 Responsive sweep
375 / 430 / 768 / 1024 / 1440 widths on each route.

### 2.8 Behavioral regression
- **#258** mobile dashboard header stacking
- **#259** mobile sports card vertical stacking
- **#267** persistent desktop chat sidebar
- **#268** sports playoff data
- **#264** print styles on briefing / journal / chat

### 2.9 Manual functional smoke test
Sign in / sign out · every nav item · Supabase writes (habit, task, meal log, journal, profile, workout set) · sync endpoints · window selector · chat streaming · voice mode · theme toggle persistence across reload.

### 2.10 Screen-reader spot check
VoiceOver on dashboard + chat.

### 2.11 Design-quality passes
- `/critique` on each route
- `/polish` on each route

---

## 3. Summary

| Dimension | Result |
|---|---|
| Build | **PASS** |
| Detector | **PASS** (0 antipatterns) |
| Token adoption | **PASS** (space/motion/radius/color/type tokens live) |
| Dead code | **PASS** (removed) |
| Typography migration | **PASS** (Hubot + Mona Sans only) |
| Hex / rgb / inline px | **PASS** |
| Bundle thresholds | **PASS** — all 11 routes under 200 kB |
| Motion tokens in revamped components | **PASS** — 0 `duration-NNN` in `.tsx` |
| Recharts footprint | **PASS** — package removed; no imports |
| Touch targets (static) | **inconclusive** — not asserted via `min-h-*`; needs manual sweep |
| axe / Lighthouse / cross-browser / responsive / regression / design passes | **deferred to manual** |

### Gate B recommendation from the mechanical audit
Mechanical side is **clean**. **Final Gate B decision (ship / refine) requires the manual checks in §2** and is the user's call.

### Remaining follow-up (optional)
Add explicit `min-h-[44px]` / `min-w-[44px]` to interactive components (or a token-backed utility class) so touch-target compliance is lintable rather than pattern-enforced. Not Gate B–blocking.

---

## 4. Fixes applied during this audit

All mechanical flags raised in §1 were corrected before finalizing this report.

### 4.1 `/dashboard` bundle bloat — Recharts removed
[`web/src/components/dashboard/watchlist-widget.tsx`](../../../web/src/components/dashboard/watchlist-widget.tsx) was the sole remaining Recharts consumer. Replaced the `<ResponsiveContainer>` + `<LineChart>` + `<Line>` trio with a local `Sparkline` component emitting a single `<path>` inside `viewBox="0 0 100 20"` + `preserveAspectRatio="none"` + `vectorEffect="non-scaling-stroke"` (keeps the 1.5 px stroke crisp as the grid-cell width flexes). `recharts` removed from `web/package.json` via `npm uninstall recharts`.

**Result:** `/dashboard` first-load JS **220 kB → 121 kB** (−99 kB). Route-specific JS: 110 kB → 10.5 kB. All 11 routes now under 200 kB.

### 4.2 Motion-token drift — 8 sites retokenized
Replaced `transition-* duration-NNN` Tailwind classes with explicit inline `transition: … var(--motion-fast|base|slow) var(--ease-out-quart)`.

| File | Old | New token |
|---|---|---|
| `components/theme-toggle.tsx` | `transition-colors duration-150` | `--motion-fast` on color/bg/border |
| `components/ui/sign-out-button.tsx` | `transition-colors duration-150` | `--motion-fast` on color/bg |
| `components/ui/metric-card.tsx` | `transition-all duration-200` | `--motion-base` on border/shadow/transform |
| `components/meals/MacroSummaryCard.tsx:34` | `transition-all duration-300` | `--motion-slow` on transform |
| `components/meals/MacroSummaryCard.tsx:134` | `transition-all duration-200` | `--motion-base` on border/shadow/transform |
| `components/meals/MealsClient.tsx:212` | `transition-all duration-300` | `--motion-slow` on transform |
| `components/meals/MealsClient.tsx:1372` | `transition-all duration-150` | `--motion-fast` on bg/color |
| `app/(protected)/meals/FoodPhotoAnalyzer.tsx:550` | `transition-all duration-150` | `--motion-fast` on bg/color |

### 4.3 Progress-bar animation — layout → transform
The first pass at retokenizing the MacroSummaryCard + MealsClient progress bars preserved `transition: width ...`. The re-run detector correctly flagged both as `layout-transition` antipatterns. Rewrote as full-width children animating `transform: scaleX(pct/100)` with `transform-origin: left center` — same visual, GPU-compositable, detector clean again. Added `willChange: "transform"` for paint layer promotion.

### 4.4 Final verification
- `npm run build` — clean, 31/31 static pages.
- `npx impeccable detect web/src/` — **0 antipatterns** (JSON committed at `impeccable-detect-post-phase-b.json`).
- Grep `\bduration-\d+\b` in `.tsx` — **0 matches**.
- Grep `from 'recharts'` in `web/` — **0 matches**.
- `"recharts"` in `package.json` — **absent**.
