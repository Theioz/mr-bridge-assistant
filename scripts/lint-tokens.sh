#!/usr/bin/env bash
# lint-tokens.sh — CI guard to prevent tokenization + inline-hover regressions.
# Closes #254. Run from repo root: bash scripts/lint-tokens.sh
# Scope decision (#357): kept as a separate bash script — ESLint cannot natively
# scan .css files (Guards 2–3: color-mix() and color:"white"), so folding into
# ESLint would require a second tool anyway with no coverage gain.

set -euo pipefail

WEB_SRC="web/src"
FAIL=0

# ── 1. No inline onMouseOver/onMouseOut hover handlers ──────────────────
# Allowlist: heatmap.tsx (tooltip state), message-bubble.tsx (reaction
# popover), slash-command-menu.tsx (highlight state). These use the handlers
# for non-style state tracking, not inline-style toggling.
HOVER_HITS=$(grep -rn 'onMouseOver\|onMouseOut' "$WEB_SRC" \
  --include='*.tsx' --include='*.ts' \
  | grep -v 'heatmap\.tsx' \
  | grep -v 'message-bubble\.tsx' \
  | grep -v 'slash-command-menu\.tsx' \
  || true)

if [[ -n "$HOVER_HITS" ]]; then
  echo "❌ Guard 1 FAILED: onMouseOver/onMouseOut found outside allowlist"
  echo "$HOVER_HITS"
  FAIL=1
else
  echo "✅ Guard 1 passed: no inline hover handlers"
fi

# ── 2. No hardcoded color: "white" ──────────────────────────────────────
WHITE_HITS=$(grep -rn 'color:.*["'"'"']white["'"'"']' "$WEB_SRC" \
  --include='*.tsx' --include='*.ts' \
  || true)

if [[ -n "$WHITE_HITS" ]]; then
  echo "❌ Guard 2 FAILED: hardcoded color: \"white\" found"
  echo "$WHITE_HITS"
  FAIL=1
else
  echo "✅ Guard 2 passed: no hardcoded white"
fi

# ── 3. No color-mix() outside globals.css ────────────────────────────────
COLORMIX_HITS=$(grep -rn 'color-mix(' "$WEB_SRC" \
  --include='*.tsx' --include='*.ts' --include='*.css' \
  | grep -v 'globals\.css' \
  || true)

if [[ -n "$COLORMIX_HITS" ]]; then
  echo "❌ Guard 3 FAILED: color-mix() used outside globals.css"
  echo "$COLORMIX_HITS"
  FAIL=1
else
  echo "✅ Guard 3 passed: no color-mix() outside globals.css"
fi

# ── 4. No raw hex colors outside token definitions ───────────────────────
# Allowlist: globals.css (token defs), FoodPhotoAnalyzer (own cleanup issue),
# chart-colors.ts (canvas/SVG needs raw hex), icon.svg (SVG markup),
# logo.tsx (SVG markup — static fill can't reference CSS vars),
# MealsClient.tsx (CSS var fallbacks — var(--token, #hex)),
# layout.tsx (viewport.themeColor must be a static hex — can't reference CSS vars),
# BacklogClient.tsx (semantic status colors: paused/finished/dropped have no CSS var),
# BacklogDetailClient.tsx (same status color set),
# share/backlog/[token]/page.tsx (CSS var fallbacks — var(--token, #hex) for SSR public page).
# Only scans .tsx/.css to avoid false positives from issue numbers in .ts.
HEX_HITS=$(grep -rn '#[0-9a-fA-F]\{3,8\}\b' "$WEB_SRC" \
  --include='*.tsx' --include='*.css' \
  | grep -v 'globals\.css' \
  | grep -v 'FoodPhoto' \
  | grep -v 'chart-colors' \
  | grep -v 'icon\.svg' \
  | grep -v 'logo\.tsx' \
  | grep -v 'MealsClient' \
  | grep -v 'layout\.tsx' \
  | grep -v 'BacklogClient' \
  | grep -v 'BacklogDetailClient' \
  | grep -v 'share/backlog' \
  || true)

if [[ -n "$HEX_HITS" ]]; then
  echo "❌ Guard 4 FAILED: raw hex colors found outside allowlist"
  echo "$HEX_HITS"
  FAIL=1
else
  echo "✅ Guard 4 passed: no raw hex colors outside allowlist"
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo ""
  echo "Token lint failed. Fix the violations above or update the allowlist in scripts/lint-tokens.sh."
  exit 1
fi

echo ""
echo "All token guards passed."
