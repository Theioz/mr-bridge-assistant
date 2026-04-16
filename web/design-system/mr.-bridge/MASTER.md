# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Mr. Bridge
**Updated:** 2026-04-12
**Category:** Personal AI Assistant Dashboard

---

## Global Rules

### Color Palette

Inspired by Linear/Raycast — deep navy-black base, indigo primary, semantic health colors.

| Role | Hex | CSS Variable | Usage |
|------|-----|--------------|-------|
| Background | `#0A0B0F` | `--color-bg` | Page background |
| Surface | `#111318` | `--color-surface` | Cards, panels |
| Surface Raised | `#181B24` | `--color-surface-raised` | Dropdowns, popovers |
| Border | `#1E2130` | `--color-border` | All borders |
| Border Subtle | `#161925` | `--color-border-subtle` | Dividers |
| Primary | `#6366F1` | `--color-primary` | Accent, links, focus rings |
| Primary Dim | `#6366F120` | `--color-primary-dim` | Focus glow, selected bg |
| Positive | `#10B981` | `--color-positive` | Health gains, streaks, up-trends |
| Warning | `#F59E0B` | `--color-warning` | Low readiness, missed habits |
| Danger | `#EF4444` | `--color-danger` | Critical readiness, declining HRV |
| Info | `#38BDF8` | `--color-info` | Neutral data, sleep stages |
| Text | `#E2E8F0` | `--color-text` | Primary text |
| Text Muted | `#64748B` | `--color-text-muted` | Labels, secondary info |
| Text Faint | `#334155` | `--color-text-faint` | Placeholders, disabled |

**Data visualization sequence** (use in order for multi-series charts):
`#6366F1` → `#10B981` → `#38BDF8` → `#F59E0B` → `#EF4444` → `#A78BFA`

---

### Typography

- **Heading Font:** DM Sans (weights: 400, 500, 600, 700)
- **Body Font:** Inter (weights: 300, 400, 500, 600)
- **Monospace (data values, numbers):** JetBrains Mono or `font-variant-numeric: tabular-nums` on Inter
- **Mood:** Clean, professional, information-dense, neutral

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap');
```

**Type Scale:**
| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `text-2xs` | 10px | 400 | Chart axis labels |
| `text-xs` | 12px | 400/500 | Badges, metadata, timestamps |
| `text-sm` | 14px | 400/500 | Body text, card content |
| `text-base` | 16px | 400/500 | Default body |
| `text-lg` | 18px | 600 | Card titles |
| `text-xl` | 20px | 600/700 | Section headings |
| `text-2xl` | 24px | 700 | Page titles |
| `text-3xl+` | 30px+ | 700 | Metric callouts (weight, score) |

**Stat/metric values** should be large (24–36px), DM Sans 700, high contrast.

---

### Spacing Variables

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` | Tight gaps, icon padding |
| `--space-sm` | `8px` | Inline spacing, tag gaps |
| `--space-md` | `16px` | Card inner padding |
| `--space-lg` | `24px` | Section padding, card grid gap |
| `--space-xl` | `32px` | Large gaps between sections |
| `--space-2xl` | `48px` | Page-level margins |

---

### Shadow Depths

All shadows use dark-mode-appropriate opacity on black (not white).

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.4)` | Subtle lift |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.5)` | Cards |
| `--shadow-lg` | `0 8px 24px rgba(0,0,0,0.6)` | Modals, dropdowns |
| `--shadow-glow` | `0 0 0 3px var(--color-primary-dim)` | Focus rings |

---

## Component Specs

### Buttons

```css
/* Primary */
.btn-primary {
  background: #6366F1;
  color: white;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  transition: all 200ms ease;
  cursor: pointer;
}
.btn-primary:hover { background: #4F52D9; }
.btn-primary:focus-visible { box-shadow: var(--shadow-glow); outline: none; }

/* Secondary / Ghost */
.btn-secondary {
  background: transparent;
  color: #E2E8F0;
  border: 1px solid #1E2130;
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  transition: all 200ms ease;
  cursor: pointer;
}
.btn-secondary:hover { background: #181B24; border-color: #2A2F45; }
```

### Cards

```css
.card {
  background: #111318;
  border: 1px solid #1E2130;
  border-radius: 12px;
  padding: 20px 24px;
  transition: border-color 200ms ease;
}
.card:hover { border-color: #2A2F45; }

/* Metric card — large stat callout */
.card-metric .metric-value {
  font-size: 32px;
  font-weight: 700;
  font-family: 'DM Sans', sans-serif;
  color: #E2E8F0;
  line-height: 1;
}
.card-metric .metric-label {
  font-size: 12px;
  color: #64748B;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 4px;
}
.card-metric .metric-delta {
  font-size: 13px;
  font-weight: 500;
  margin-top: 8px;
}
.metric-delta.up { color: #10B981; }
.metric-delta.down { color: #EF4444; }
.metric-delta.neutral { color: #64748B; }
```

### Inputs

```css
.input {
  padding: 10px 14px;
  background: #111318;
  border: 1px solid #1E2130;
  border-radius: 8px;
  font-size: 14px;
  color: #E2E8F0;
  transition: border-color 200ms ease;
  width: 100%;
}
.input::placeholder { color: #334155; }
.input:focus {
  border-color: #6366F1;
  outline: none;
  box-shadow: 0 0 0 3px #6366F120;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(6px);
}
.modal {
  background: #111318;
  border: 1px solid #1E2130;
  border-radius: 16px;
  padding: 28px 32px;
  box-shadow: var(--shadow-lg);
  max-width: 520px;
  width: 90%;
}
```

### Sidebar Nav

```css
.sidebar {
  width: 240px;
  background: #0A0B0F;
  border-right: 1px solid #1E2130;
  padding: 16px 12px;
  position: fixed;
  height: 100vh;
  overflow-y: auto;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #64748B;
  cursor: pointer;
  transition: all 150ms ease;
}
.nav-item:hover { background: #111318; color: #E2E8F0; }
.nav-item.active { background: #6366F120; color: #6366F1; }
```

---

## Data Visualization

The app has Recharts installed. Use these chart types per data source.

### Chart Theme (apply to all Recharts components)

```tsx
const CHART_COLORS = {
  primary: '#6366F1',
  positive: '#10B981',
  info: '#38BDF8',
  warning: '#F59E0B',
  danger: '#EF4444',
  purple: '#A78BFA',
}

const chartDefaults = {
  backgroundColor: 'transparent',
  gridColor: '#1E2130',
  axisColor: '#334155',
  labelColor: '#64748B',
  tooltipBg: '#181B24',
  tooltipBorder: '#2A2F45',
}
```

### Charts by Data Source

#### Body Composition (`fitness_log` table)

| Metric | Chart Type | Color | Notes |
|--------|-----------|-------|-------|
| Weight trend | `LineChart` | `#6366F1` | 30/90-day window, reference line at goal weight |
| Body fat % | `AreaChart` | `#10B981` | Gradient fill from color to transparent |
| Muscle mass | `AreaChart` | `#38BDF8` | Overlay with body fat for context |
| BMI | `LineChart` | `#A78BFA` | Show healthy range band (18.5–24.9) |

#### Recovery (`recovery_metrics` table — Oura)

| Metric | Chart Type | Color | Notes |
|--------|-----------|-------|-------|
| Readiness score | `RadialBarChart` or gauge | Dynamic | Green ≥70, Amber 50–69, Red <50 |
| HRV trend | `AreaChart` | `#10B981` | 7/14-day, highlight declining stretches in `#EF4444` |
| Resting HR | `LineChart` | `#38BDF8` | Lower is better — invert visual emphasis |
| Sleep total | `BarChart` | `#6366F1` | Stack: Deep `#6366F1`, REM `#A78BFA`, Light `#38BDF8` |
| Sleep score | `LineChart` | `#10B981` | Reference line at 70 |

#### Workouts (`workout_sessions` table — Fitbit)

| Metric | Chart Type | Color | Notes |
|--------|-----------|-------|-------|
| Weekly frequency | `BarChart` | `#6366F1` | 7-bar rolling week |
| Calories burned | `BarChart` | `#F59E0B` | Stack by activity type if available |
| Active minutes | `AreaChart` | `#10B981` | Cumulative daily view |

#### Habits (`habits` + `habit_registry` tables)

| Metric | Chart Type | Color | Notes |
|--------|-----------|-------|-------|
| Completion heatmap | Custom grid (7×N) | `#10B981` | GitHub-style, muted for missed |
| Streak per habit | Horizontal `BarChart` | `#6366F1` | Sorted by streak length |
| Weekly rate | `RadialBarChart` | Dynamic | Per-habit completion % |

#### Meals / Nutrition (`meal_log` + `recipes` tables)

| Metric | Chart Type | Color | Notes |
|--------|-----------|-------|-------|
| Macro split | `PieChart` | Sequence | Protein `#10B981`, Carbs `#6366F1`, Fat `#F59E0B` |
| Calories per day | `BarChart` | `#38BDF8` | Reference line at goal |

### Recharts Global Config

```tsx
// Apply to all charts
<CartesianGrid strokeDasharray="3 3" stroke="#1E2130" vertical={false} />
<XAxis stroke="#334155" tick={{ fill: '#64748B', fontSize: 12 }} />
<YAxis stroke="#334155" tick={{ fill: '#64748B', fontSize: 12 }} />
<Tooltip
  contentStyle={{ background: '#181B24', border: '1px solid #2A2F45', borderRadius: 8 }}
  labelStyle={{ color: '#E2E8F0', fontSize: 13 }}
  itemStyle={{ color: '#64748B', fontSize: 12 }}
/>
```

---

## Layout Pattern

**Pattern:** AI Assistant Dashboard

- **Layout:** Fixed 240px sidebar + fluid main content (`margin-left: 240px`)
- **Mobile:** Bottom tab nav (5 items max), sidebar hidden
- **Breakpoints:** 375px (mobile), 768px (tablet, sidebar collapsed), 1024px+ (full layout)
- **Grid:** 12-column for main content. Metric cards: 3–4 per row on desktop, 2 on tablet, 1 on mobile
- **Page sections:** Briefing summary strip (top) → KPI metric cards → Charts row → Recent activity / chat

---

## Style Guidelines

**Style:** Dark Professional Dashboard (Linear/Raycast-inspired)

**Key Effects:**
- Text glow: `text-shadow: var(--text-glow)` on `.font-heading` — dark mode only (`0 0 12px rgba(248,250,252,0.3)`; light: `none`)
- Transitions: 150–200ms ease for interactive elements
- Hover: border-color shift, no layout-shifting transforms
- Focus: visible indigo ring (`box-shadow: 0 0 0 3px #6366F120`)
- Loading states: skeleton shimmer using `#181B24` → `#1E2130` gradient
- Charts: animate on mount (`isAnimationActive={true}`, 600ms ease-out)
- `prefers-reduced-motion`: disable all animations when set

---

## Anti-Patterns

- No emojis as icons — use Lucide React (already in package.json)
- No light mode default — dark only
- No layout-shifting hover transforms (translateY breaks grid flow)
- No low-contrast text — minimum 4.5:1 ratio
- No instant state changes — always transition
- No invisible focus states
- No horizontal scroll on mobile
- No content hidden behind fixed navbars (use `padding-top` on main)
- No hardcoded colors in component files — reference CSS variables or Tailwind tokens

---

## Pre-Delivery Checklist

- [ ] All icons from Lucide React, no emojis
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states: border or color shift, 150–200ms ease
- [ ] Focus rings visible (`ring-2 ring-indigo-500/20` or CSS equivalent)
- [ ] Text contrast ≥ 4.5:1 on all surface colors
- [ ] `prefers-reduced-motion` disables animations
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No horizontal scroll on mobile
- [ ] Recharts tooltip styled to dark theme
- [ ] Chart axes use muted label color (`#64748B`), no heavy grid lines
- [ ] Metric deltas show directional color (green up, red down, gray neutral)
- [ ] Skeleton loaders on all async data (no blank cards)
