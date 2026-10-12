# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** mr-bridge
**Generated:** 2026-04-15 (ui-ux-pro-max); rewritten to match the shipped tokens in #761
**Category:** Personal dashboard — single user, self-hosted. No in-app chat (#476): conversation
happens in Claude Code over MCP; the web UI is the visual layer and the phone logging client.

**Source of truth:** `web/src/app/globals.css`. Design intent and tone: `.impeccable.md`. If this
file and globals.css disagree, globals.css wins — fix this file.

---

## Global Rules

### Color

OKLCH throughout. Neutrals are tinted toward one brand hue (`--hue: 240`); there is a **single
accent**, a muted amber. Both themes are full-fidelity: `:root` / `[data-theme="dark"]` is the
dark palette, `[data-theme="light"]` the light one, and the user preference (`theme_preference`,
default `system`) picks between them.

| Role | Token |
|------|-------|
| Page background | `--color-bg` (`--color-bg-0`) |
| Surface / raised surface | `--color-surface` (`--color-bg-1`), `--color-surface-raised` (`--color-bg-2`) |
| Borders / hairlines | `--color-border`, `--color-border-subtle`; new components prefer `--rule`, `--rule-soft` |
| Text tiers | `--color-text`, `--color-text-muted`, `--color-text-faint` |
| Accent | `--accent`, `--accent-text` (text-safe), `--accent-soft` |
| Accent aliases | `--color-primary`, `--color-secondary`, `--color-cta`, `--color-warning`, `--color-amber` — all the same amber; `--color-primary-dim` for tints |
| Accent tints | `--color-cta-subtle`, `--color-cta-subtle-strong`, `--warning-subtle`, `--warning-subtle-strong` |
| Status | `--color-positive` (+ `-subtle`, `-subtle-strong`, `-light`, `-lighter`, `-lightest`), `--color-danger` (+ `-subtle`), `--color-info` |
| Text on accent | `--color-text-on-cta` (dark ink, not white) |
| Overlay / hover | `--overlay-scrim`, `--hover-subtle` |
| Skeleton | `--color-skeleton` |
| Charts | `--chart-color-primary`, `--chart-color-baseline`, `--chart-color-today`, `--chart-color-faint`, `--chart-stroke`, `--chart-stroke-thin` |

**Color notes:** the accent is for state changes, focus rings, today markers and the one thing on
screen that needs attention — not decoration.

### Typography

- **Body/UI:** Mona Sans → `--font-body`
- **Display (headings, key numerals):** Hubot Sans → `--font-display`, via `.font-heading`
- Both loaded with `next/font/google` in `web/src/app/layout.tsx` (no CSS `@import`).
- **Scale:** `--t-display` (the hero metric only), `--t-h1`, `--t-h2` (section headers), `--t-body`,
  `--t-meta`, `--t-micro`.
- **Numbers:** `.tnum` (tabular figures) wherever a number sits next to another number.
- Reading width for sentence content: `.prose-column` (62ch).

### Spacing, radius, shadow

| Token | Value |
|-------|-------|
| `--space-1` … `--space-9` | 4, 8, 12, 16, 24, 32, 48, 64, 96 px |
| `--r-1`, `--r-2` | 4px, 8px |
| `--shadow-sm`, `--shadow-md`, `--shadow-lg` | theme-specific (OKLCH) |
| `--shadow-glow` | 3px accent-dim ring |

### Motion

- Durations: `--motion-fast` (120ms), `--motion-base` (220ms), `--motion-slow` (360ms).
- Easing: `--ease-out-quart`, `--ease-out-quint`. No bounce, no elastic.
- Page entrance: sections opt in with `data-reveal` + `data-stagger="N"` (60ms steps, under 500ms total).
- `prefers-reduced-motion: reduce` disables the reveal and non-essential motion.
- Animate `transform` / `opacity` only.

### Focus

Global `:focus-visible` is a 2px `--accent` outline with 2px offset. Never remove it without a
visible replacement.

---

## Enforced by CI (`scripts/lint-tokens.sh`)

1. No inline `onMouseOver` / `onMouseOut` hover handlers — use CSS `:hover`.
2. No hardcoded `color: "white"`.
3. No `color-mix()` outside `globals.css`.
4. No raw hex colours in `.tsx` / `.css` outside the allowlist in the script (token definitions,
   SVG markup, `food-art.tsx`, the standalone share pages, and a few documented exceptions).
   Comments are ignored, so an issue number like `#609` is fine.

Add a token to `globals.css` (both palettes) rather than adding to the allowlist.

---

## Layout

- **Desktop (`lg` and up):** fixed left nav (`web/src/components/nav.tsx`) plus the main column.
- **Mobile:** bottom nav with four primary destinations (Dashboard, Habits, Tasks, Meals) and a
  "More" sheet for the rest.
- **Dashboard order:** greeting and weather, today's food, today's workout, habits,
  recovery/health, schedule, tasks, watchlist/sports.
- Same content on both widths, laid out for one column — not a stripped-down mobile view.
- **Information density:** high. Tables and stat rows over prose cards; cards only when grouping
  needs them.

---

## Anti-Patterns (Do NOT Use)

- **Emojis as icons.** Use `lucide-react`.
- **Raw colour literals.** Use a token (see the CI guards above).
- **Layout-shifting hovers.** No scale transforms that move neighbours.
- **Low-contrast text.** WCAG AA minimum (4.5:1) in both themes.
- **Invisible focus states.**
- **Purple gradients, glow pulses, big-number metric-card grids.** See `.impeccable.md` for the full anti-references.

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] `bash scripts/lint-tokens.sh` passes
- [ ] Every colour, space, radius and duration comes from a token
- [ ] Checked in both light and dark themes
- [ ] Icons from `lucide-react`; no emojis as icons
- [ ] `cursor: pointer` on clickable elements; hover/focus transitions use `--motion-fast`
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Touch targets at least 44px on mobile
- [ ] Responsive: 375px, 768px, 1024px, 1440px; no horizontal scroll on mobile
- [ ] No content hidden behind the fixed nav
