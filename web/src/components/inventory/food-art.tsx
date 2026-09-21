import type { JSX } from "react";

/**
 * Flat illustrations for inventory items, drawn inline rather than loaded as files.
 *
 * WHY INLINE SVG AND NOT IMAGE FILES
 *
 * The fridge shows ~40 tiles at once. As files that is ~40 requests and ~40 chances to render
 * a broken-image box; inline it is zero requests, and every icon inherits the page's theme
 * tokens for its plate so it sits correctly in both light and dark. Storage was never the
 * constraint (Jason: "we have a NAS") — request count and theming were.
 *
 * WHICH ICON A ROW GETS IS A DATABASE DECISION, NOT A STRING MATCH.
 * `inventory_items.image_key` is set deliberately, one row at a time. Names here are freeform
 * ("Chicken thighs, boneless skinless (Just Bare)") and matching on them is the exact trap
 * `inventory-draw.ts` already defends against by requiring EQUAL token sets rather than subset:
 * {garlic} is a subset of {garlic, powder}, so a subset match draws fresh garlic out of the
 * powder jar. A row with no key falls back to its category, and a row with no category falls
 * back to a neutral plate. Nothing guesses.
 *
 * Adding a food: draw it here, then set `image_key` on the row. Both halves, deliberately.
 */

// Food colour reads as food in both themes, so these are literals rather than theme tokens —
// a chicken breast that flips to dark mode is not a chicken breast. Only the plate behind them
// is themed. Tones are pulled slightly toward grey so a grid of 40 does not vibrate.
const C = {
  chicken: "#E3B393",
  chickenDark: "#C98F6B",
  beef: "#C26B5C",
  beefDark: "#9E4F43",
  salmon: "#E8917A",
  salmonPale: "#F3BCA9",
  shell: "#F2EDE4",
  yolk: "#EFB22E",
  cream: "#F5F1EA",
  leaf: "#6FA353",
  leafDark: "#4E7838",
  stalk: "#9BC47C",
  pepper: "#78B265",
  potato: "#D08350",
  potatoDark: "#A9633A",
  berry: "#8E5490",
  berryRed: "#B5445A",
  grain: "#DCC08C",
  tomato: "#C24A3A",
  bean: "#4E3C34",
  beanRed: "#8C3A32",
  metal: "#AEB6BD",
  metalDark: "#8A939B",
  nut: "#C99B6B",
  butter: "#C98B4B",
  oil: "#BFAE5F",
  chili: "#B33A2B",
  glass: "#93A0A8",
  coffee: "#6B4A38",
  whey: "#E6DFD3",
  pastaY: "#E5C983",
  pastaG: "#8FA86A",
  pastaR: "#C98070",
  lid: "#E0B43A",
  seed: "#B98F5E",
} as const;

function Plate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <circle cx="32" cy="32" r="30" fill="var(--rule-soft)" opacity="0.5" />
      {children}
    </>
  );
}

const ART: Record<string, () => JSX.Element> = {
  "chicken-breast": () => (
    <Plate>
      {/* Teardrop fillet with a tapered tail and score lines. A plain oval reads as nothing. */}
      <path
        d="M17 34c0-9 8-16 18-16 8 0 12 5 12 11 0 8-6 13-12 15-5 2-9 3-12 2l4-5c-6-1-10-3-10-7z"
        fill={C.chicken}
      />
      <path
        d="M26 26c5-3 10-3 14 0"
        stroke={C.chickenDark}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M27 33c5-2 9-2 13 1"
        stroke={C.chickenDark}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        opacity="0.7"
      />
    </Plate>
  ),
  "chicken-thigh": () => (
    <Plate>
      <path d="M22 41c-4-6-2-14 5-18 7-4 15-1 18 5 3 7-1 14-8 16-6 2-12 1-15-3z" fill={C.chicken} />
      <path d="M40 43c3 3 6 4 9 3l-3 6c-3 1-6-1-8-4z" fill={C.chickenDark} />
    </Plate>
  ),
  "ground-beef": () => (
    <Plate>
      <path d="M16 40c0-7 7-13 16-13s16 6 16 13c0 3-2 5-5 5H21c-3 0-5-2-5-5z" fill={C.beef} />
      <circle cx="25" cy="36" r="2.2" fill={C.beefDark} />
      <circle cx="33" cy="33" r="2.2" fill={C.beefDark} />
      <circle cx="40" cy="37" r="2.2" fill={C.beefDark} />
    </Plate>
  ),
  salmon: () => (
    <Plate>
      <path
        d="M14 32c6-9 16-13 26-12 7 1 10 5 10 12s-3 11-10 12c-10 1-20-3-26-12z"
        fill={C.salmon}
      />
      <path
        d="M20 32c5-5 12-7 19-7M20 36c5 4 12 6 19 6"
        stroke={C.salmonPale}
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
    </Plate>
  ),
  eggs: () => (
    <Plate>
      <ellipse cx="26" cy="36" rx="11" ry="13" fill={C.shell} />
      <ellipse cx="41" cy="30" rx="9" ry="11" fill={C.cream} />
      <circle cx="41" cy="30" r="4" fill={C.yolk} />
    </Plate>
  ),
  "greek-yogurt": () => (
    <Plate>
      <path d="M20 22h24l-3 24a3 3 0 0 1-3 3H26a3 3 0 0 1-3-3z" fill={C.cream} />
      <rect x="18" y="17" width="28" height="6" rx="3" fill={C.metal} />
      <path d="M27 30h10" stroke={C.metalDark} strokeWidth="2" strokeLinecap="round" />
    </Plate>
  ),
  broccoli: () => (
    <Plate>
      <circle cx="24" cy="26" r="8" fill={C.leafDark} />
      <circle cx="35" cy="22" r="7.5" fill={C.leaf} />
      <circle cx="41" cy="30" r="7" fill={C.leafDark} />
      <circle cx="31" cy="31" r="8" fill={C.leaf} />
      <path d="M28 36h8l-2 12h-4z" fill={C.stalk} />
    </Plate>
  ),
  spinach: () => (
    <Plate>
      <path d="M32 46C18 44 14 32 20 22c10-4 22 1 24 12 1 7-4 12-12 12z" fill={C.leafDark} />
      <path d="M40 24 26 42" stroke={C.stalk} strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M36 28l-4 2M38 33l-5 2M33 24l-4 3"
        stroke={C.stalk}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </Plate>
  ),
  "green-beans": () => (
    <Plate>
      <path
        d="M16 40c8-14 20-20 32-20"
        stroke={C.leaf}
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M16 46c8-14 20-20 32-20"
        stroke={C.leafDark}
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M20 32c7-10 16-14 26-14"
        stroke={C.stalk}
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
    </Plate>
  ),
  "sweet-potato": () => (
    <Plate>
      <path
        d="M14 36c2-9 11-15 22-15 9 0 14 5 14 12s-7 12-17 13c-12 1-20-3-19-10z"
        fill={C.potato}
      />
      <path
        d="M24 30c5-3 11-4 16-3"
        stroke={C.potatoDark}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </Plate>
  ),
  "bell-pepper": () => (
    <Plate>
      <path d="M20 32c0-7 5-11 12-11s12 4 12 11c0 9-4 16-12 16s-12-7-12-16z" fill={C.pepper} />
      <path
        d="M31 21v-5M31 16c3-2 6-1 7 1"
        stroke={C.leafDark}
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
      />
    </Plate>
  ),
  berries: () => (
    <Plate>
      <circle cx="25" cy="34" r="8" fill={C.berry} />
      <circle cx="38" cy="30" r="7" fill={C.berryRed} />
      <circle cx="34" cy="41" r="6.5" fill={C.berry} />
      <circle cx="23" cy="31" r="1.6" fill={C.cream} opacity="0.6" />
    </Plate>
  ),
  rice: () => (
    <Plate>
      {/* Mound of rice sitting IN the bowl. An earlier version floated loose grains above the
          rim; at 44px they read as a pair of eyes rather than as rice. */}
      <path d="M20 31c2-7 6-10 12-10s10 3 12 10z" fill={C.cream} />
      <ellipse cx="32" cy="31" rx="15" ry="3" fill={C.cream} />
      <path d="M17 32h30c0 9-7 15-15 15s-15-6-15-15z" fill={C.metal} />
      <path d="M21 36h22c-1 5-5 8-11 8s-10-3-11-8z" fill={C.metalDark} opacity="0.45" />
      <ellipse
        cx="27"
        cy="27"
        rx="2.4"
        ry="1.4"
        fill={C.metal}
        opacity="0.55"
        transform="rotate(-20 27 27)"
      />
      <ellipse
        cx="34"
        cy="25"
        rx="2.4"
        ry="1.4"
        fill={C.metal}
        opacity="0.55"
        transform="rotate(15 34 25)"
      />
      <ellipse
        cx="38"
        cy="29"
        rx="2.4"
        ry="1.4"
        fill={C.metal}
        opacity="0.55"
        transform="rotate(-8 38 29)"
      />
    </Plate>
  ),
  pasta: () => (
    <Plate>
      <path
        d="M22 18c5 4 5 10 0 14s-5 10 0 14"
        stroke={C.pastaY}
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M32 16c5 4 5 10 0 14s-5 10 0 16"
        stroke={C.pastaG}
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M42 18c5 4 5 10 0 14s-5 10 0 14"
        stroke={C.pastaR}
        strokeWidth="5"
        fill="none"
        strokeLinecap="round"
      />
    </Plate>
  ),
  "chickpea-pasta": () => (
    <Plate>
      <path
        d="M24 17c6 4 6 11 0 15s-6 11 0 15"
        stroke={C.grain}
        strokeWidth="5.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M40 17c6 4 6 11 0 15s-6 11 0 15"
        stroke={C.nut}
        strokeWidth="5.5"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="32" cy="46" r="4" fill={C.grain} />
    </Plate>
  ),
  oats: () => (
    <Plate>
      <path d="M18 34h28c0 9-6 14-14 14s-14-5-14-14z" fill={C.grain} />
      <rect x="15" y="31" width="34" height="4" rx="2" fill={C.metalDark} />
      <ellipse cx="26" cy="24" rx="3.4" ry="2.2" fill={C.seed} transform="rotate(-25 26 24)" />
      <ellipse cx="34" cy="20" rx="3.4" ry="2.2" fill={C.seed} transform="rotate(15 34 20)" />
      <ellipse cx="40" cy="26" rx="3.4" ry="2.2" fill={C.seed} transform="rotate(-10 40 26)" />
    </Plate>
  ),
  flaxseed: () => (
    <Plate>
      <path d="M19 36h26c0 8-6 12-13 12s-13-4-13-12z" fill={C.seed} />
      <rect x="16" y="33" width="32" height="4" rx="2" fill={C.metalDark} />
      {[
        [25, 24, -30],
        [32, 20, 10],
        [39, 25, 35],
        [30, 28, -10],
      ].map(([x, y, r]) => (
        <ellipse
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          rx="3"
          ry="1.7"
          fill={C.nut}
          transform={`rotate(${r} ${x} ${y})`}
        />
      ))}
    </Plate>
  ),
  "beans-can": () => (
    <Plate>
      <rect x="20" y="18" width="24" height="30" rx="3" fill={C.metal} />
      <rect x="20" y="26" width="24" height="14" fill={C.beanRed} />
      <ellipse cx="32" cy="18" rx="12" ry="3.5" fill={C.metalDark} />
      <circle cx="27" cy="33" r="2.4" fill={C.bean} />
      <circle cx="34" cy="31" r="2.4" fill={C.bean} />
      <circle cx="37" cy="36" r="2.4" fill={C.bean} />
    </Plate>
  ),
  "tomatoes-can": () => (
    <Plate>
      <rect x="20" y="18" width="24" height="30" rx="3" fill={C.metal} />
      <rect x="20" y="26" width="24" height="14" fill={C.tomato} />
      <ellipse cx="32" cy="18" rx="12" ry="3.5" fill={C.metalDark} />
      <circle cx="32" cy="33" r="4.5" fill={C.cream} opacity="0.35" />
    </Plate>
  ),
  "pasta-sauce": () => (
    <Plate>
      <path d="M23 24h18v22a3 3 0 0 1-3 3H26a3 3 0 0 1-3-3z" fill={C.tomato} />
      <rect x="25" y="14" width="14" height="10" rx="2" fill={C.glass} />
      <rect x="24" y="12" width="16" height="5" rx="2.5" fill={C.lid} />
      <rect x="25" y="31" width="14" height="8" rx="1.5" fill={C.cream} opacity="0.55" />
    </Plate>
  ),
  almonds: () => (
    <Plate>
      <ellipse cx="27" cy="35" rx="7" ry="10" fill={C.nut} transform="rotate(-20 27 35)" />
      <ellipse cx="38" cy="31" rx="6.5" ry="9.5" fill={C.seed} transform="rotate(25 38 31)" />
      <path d="M27 29v11" stroke={C.seed} strokeWidth="1.4" opacity="0.7" />
    </Plate>
  ),
  "peanut-butter": () => (
    <Plate>
      <path d="M22 24h20v22a3 3 0 0 1-3 3H25a3 3 0 0 1-3-3z" fill={C.butter} />
      <rect x="24" y="14" width="16" height="10" rx="2" fill={C.glass} />
      <rect x="23" y="12" width="18" height="5" rx="2.5" fill={C.beefDark} />
      <rect x="25" y="32" width="14" height="8" rx="1.5" fill={C.cream} opacity="0.5" />
    </Plate>
  ),
  "avocado-oil": () => (
    <Plate>
      <path d="M26 22h12v24a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3z" fill={C.oil} />
      <rect x="29" y="12" width="6" height="11" rx="2" fill={C.oil} opacity="0.7" />
      <rect x="28" y="9" width="8" height="5" rx="2" fill={C.leafDark} />
      <rect x="28" y="31" width="8" height="9" rx="1.5" fill={C.cream} opacity="0.45" />
    </Plate>
  ),
  "chili-crunch": () => (
    <Plate>
      <path d="M23 25h18v21a3 3 0 0 1-3 3H26a3 3 0 0 1-3-3z" fill={C.chili} />
      <rect x="23" y="13" width="18" height="12" rx="2" fill={C.glass} />
      <rect x="22" y="11" width="20" height="5" rx="2.5" fill={C.lid} />
      <circle cx="28" cy="36" r="1.8" fill={C.lid} />
      <circle cx="34" cy="33" r="1.6" fill={C.lid} />
      <circle cx="36" cy="40" r="1.7" fill={C.lid} />
    </Plate>
  ),
  gochujang: () => (
    <Plate>
      <rect x="21" y="20" width="22" height="28" rx="4" fill={C.chili} />
      <rect x="21" y="15" width="22" height="7" rx="3" fill={C.beefDark} />
      <rect x="25" y="28" width="14" height="12" rx="2" fill={C.cream} opacity="0.35" />
    </Plate>
  ),
  "hot-sauce": () => (
    <Plate>
      <path d="M27 24h10v22a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3z" fill={C.beefDark} />
      <rect x="29" y="13" width="6" height="12" rx="2" fill={C.glass} />
      <rect x="28" y="10" width="8" height="5" rx="2" fill={C.chili} />
      <rect x="28" y="32" width="8" height="9" rx="1.5" fill={C.cream} opacity="0.4" />
    </Plate>
  ),
  spice: () => (
    <Plate>
      <rect x="23" y="22" width="18" height="26" rx="3" fill={C.chili} opacity="0.85" />
      <rect x="22" y="15" width="20" height="8" rx="3" fill={C.metalDark} />
      <circle cx="28" cy="19" r="1.2" fill={C.cream} />
      <circle cx="32" cy="19" r="1.2" fill={C.cream} />
      <circle cx="36" cy="19" r="1.2" fill={C.cream} />
    </Plate>
  ),
  whey: () => (
    <Plate>
      <rect x="21" y="22" width="22" height="26" rx="4" fill={C.whey} />
      <rect x="20" y="15" width="24" height="8" rx="3" fill={C.metalDark} />
      <path d="M26 31h12v9H26z" fill={C.beefDark} opacity="0.6" />
    </Plate>
  ),
  pickles: () => (
    <Plate>
      <rect x="22" y="20" width="20" height="28" rx="4" fill={C.stalk} opacity="0.55" />
      <rect x="21" y="14" width="22" height="7" rx="3" fill={C.leafDark} />
      <ellipse cx="29" cy="30" rx="4" ry="7" fill={C.leaf} />
      <ellipse cx="36" cy="38" rx="4" ry="7" fill={C.leafDark} />
    </Plate>
  ),
  coffee: () => (
    <Plate>
      <path d="M24 22h16v24a3 3 0 0 1-3 3H27a3 3 0 0 1-3-3z" fill={C.coffee} />
      <rect x="27" y="12" width="10" height="11" rx="2" fill={C.glass} />
      <rect x="26" y="9" width="12" height="5" rx="2.5" fill={C.leafDark} />
      <rect x="26" y="30" width="12" height="9" rx="1.5" fill={C.cream} opacity="0.4" />
    </Plate>
  ),
};

// Category fallbacks. A row with no image_key still gets something honest rather than a gap.
const CATEGORY_ART: Record<string, keyof typeof ART> = {
  protein: "chicken-breast",
  dairy: "greek-yogurt",
  produce: "broccoli",
  vegetable: "broccoli",
  fruit: "berries",
  grain: "rice",
  fat: "almonds",
  condiment: "spice",
  sauce: "tomatoes-can",
  beverage: "coffee",
  supplement: "whey",
};

export function hasArt(imageKey: string | null | undefined): boolean {
  return !!imageKey && imageKey in ART;
}

export function FoodArt({
  imageKey,
  category,
  size = 44,
}: {
  imageKey?: string | null;
  category?: string | null;
  size?: number;
}) {
  const key =
    (imageKey && imageKey in ART && imageKey) || (category && CATEGORY_ART[category]) || null;
  const Draw = key ? ART[key] : null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden
      style={{ display: "block", flexShrink: 0 }}
    >
      {Draw ? (
        <Draw />
      ) : (
        // No key and no category: a neutral plate, never a broken-image box.
        <>
          <circle cx="32" cy="32" r="30" fill="var(--rule-soft)" opacity="0.5" />
          <circle
            cx="32"
            cy="32"
            r="13"
            fill="none"
            stroke="var(--color-text-faint)"
            strokeWidth="2"
          />
        </>
      )}
    </svg>
  );
}
