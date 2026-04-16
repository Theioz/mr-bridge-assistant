# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** mr-bridge
**Generated:** 2026-04-15 12:52:08
**Category:** Personal AI Assistant — Chat + Dashboard

---

## Global Rules

### Color Palette

Dark mode is the default (per style: Dark Mode OLED). Light mode tokens provided for users who prefer it.

| Role | Dark (default) | Light | CSS Variable |
|------|----------------|-------|--------------|
| Primary | `#3B82F6` | `#1E40AF` | `--color-primary` |
| Secondary | `#60A5FA` | `#3B82F6` | `--color-secondary` |
| CTA/Accent | `#F59E0B` | `#F59E0B` | `--color-cta` |
| Background | `#0B0F19` | `#F8FAFC` | `--color-background` |
| Surface (cards) | `#111827` | `#FFFFFF` | `--color-surface` |
| Border | `#1F2937` | `#E2E8F0` | `--color-border` |
| Text (primary) | `#F8FAFC` | `#0F172A` | `--color-text` |
| Text (muted) | `#94A3B8` | `#475569` | `--color-text-muted` |
| Text on CTA/primary surface | `#FFFFFF` | `#FFFFFF` | `--color-text-on-cta` |
| Modal/sheet scrim | `rgba(0,0,0,0.6)` | `rgba(15,23,42,0.4)` | `--overlay-scrim` |
| Subtle hover tint | `rgba(255,255,255,0.04)` | `rgba(15,23,42,0.04)` | `--hover-subtle` |
| Warning surface tint | `rgba(245,158,11,0.08)` | `rgba(180,83,9,0.08)` | `--warning-subtle` |
| Warning surface tint (strong) | `rgba(245,158,11,0.16)` | `rgba(180,83,9,0.14)` | `--warning-subtle-strong` |
| Danger surface tint | `rgba(239,68,68,0.15)` | `rgba(185,28,28,0.10)` | `--color-danger-subtle` |
| Positive surface tint | `rgba(16,185,129,0.15)` | `rgba(5,150,105,0.12)` | `--color-positive-subtle` |
| Positive surface tint (strong) | `rgba(16,185,129,0.30)` | `rgba(5,150,105,0.24)` | `--color-positive-subtle-strong` |
| CTA surface tint | `rgba(245,158,11,0.15)` | `rgba(245,158,11,0.18)` | `--color-cta-subtle` |
| CTA surface tint (strong) | `rgba(245,158,11,0.40)` | `rgba(245,158,11,0.45)` | `--color-cta-subtle-strong` |
| Skeleton shimmer base | `#181B24` | `#E2E8F0` | `--color-skeleton` |
| Positive gradient — light | `#34D399` | `#34D399` | `--color-positive-light` |
| Positive gradient — lighter | `#6EE7B7` | `#6EE7B7` | `--color-positive-lighter` |
| Positive gradient — lightest | `#A7F3D0` | `#A7F3D0` | `--color-positive-lightest` |

**Color Notes:** Blue = data/identity, amber = CTA/highlights. Keep amber rare — accents and primary actions only.

### Typography

- **Heading Font:** DM Sans
- **Body Font:** Inter
- **Mood:** dashboard, data, analytics, technical, precise (deviation from original Fira spec — cleaner geometric sans preferred)
- **Google Fonts:** [DM Sans + Inter](https://fonts.google.com/share?selection.family=DM+Sans:wght@400;500;600;700|Inter:wght@300;400;500;600)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap');
```

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #F59E0B;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #1E40AF;
  border: 2px solid #1E40AF;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #F8FAFC;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #1E40AF;
  outline: none;
  box-shadow: 0 0 0 3px #1E40AF20;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Dark Mode (OLED)

**Keywords:** Dark theme, low light, high contrast, deep black, midnight blue, eye-friendly, OLED, night mode, power efficient

**Best For:** Night-mode apps, coding platforms, entertainment, eye-strain prevention, OLED devices, low-light

**Key Effects:** Minimal glow (`text-shadow: var(--text-glow)` on `.font-heading`, dark mode only), dark-to-light transitions, low white emission, high readability, visible focus

### Page Pattern

**Pattern Name:** Sidebar + Main (Chat/Dashboard App Shell)

- **Layout Strategy:** Persistent left sidebar for navigation and session history; main content area flexes between chat stream and dashboard/briefing views. Collapses to bottom nav or drawer on mobile (<768px).
- **Primary Views:**
  1. **Chat** — message stream, sticky composer at bottom, session list in sidebar
  2. **Briefing** — data-dense dashboard: weather, schedule, habits, body comp, recovery, activity
  3. **Settings** — profile, location, integrations (Oura/Fitbit/Google Fit)
- **Information Density:** High — assistant's voice is "direct, structured, high-density, no filler." UI should match: tables and stat grids over prose cards, consistent row heights, minimal decoration.
- **CTA Placement:** Primary CTA is the composer input (chat). Secondary actions inline (row-level in tables, icon buttons in headers).
- **Section Order (Briefing):** Weather → Schedule → Unread emails → Tasks → Habits → Body comp → Recovery → Activity (mirrors briefing format in CLAUDE.md rules)

---

## Anti-Patterns (Do NOT Use)

- ❌ Light mode default
- ❌ Slow rendering

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
