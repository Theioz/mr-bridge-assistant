import { formatIngredient, groupIngredients, parseIngredients } from "@/lib/units";
import type { RecipeIngredient } from "@/lib/types";

/**
 * A recipe's ingredients.
 *
 * Two storage shapes reach this component and it renders them identically:
 *
 *   `items`  structured `recipes.ingredients_json` — the one to write going forward.
 *   `text`   legacy `recipes.ingredients` free text, one ingredient per line.
 *
 * Structured wins when present; text is the fallback while the backfill runs, so a half-converted
 * library renders correctly throughout. Both paths go through the same annotators in units.ts
 * (imperial equivalents, rice `go`), which is why a converted recipe looks the same as it did
 * before conversion rather than quietly losing its unit hints.
 *
 * Text parsing lives in `parseIngredients`, which also recovers a JSON array written into the text
 * column — a batch script did exactly that in August 2026 and the page printed the raw JSON at
 * Jason. Keeping that recovery here means the next bad write still degrades to a correct list.
 *
 * A real `<ul>` rather than a text blob: an ingredient list IS a list, and screen readers announce
 * the item count, which a pre-line paragraph does not.
 */
export function IngredientList({
  items,
  text,
  tone = "default",
}: {
  items?: RecipeIngredient[] | null;
  text?: string | null;
  tone?: "default" | "muted";
}) {
  const color = tone === "muted" ? "var(--color-text-muted)" : "var(--color-text)";

  if (items?.length) {
    const groups = groupIngredients(items);
    // A single ungrouped bucket is the common case — render a bare list with no heading rather
    // than wrapping every flat recipe in a pointless section.
    const flat = groups.length === 1 && groups[0].group === null;
    return (
      <div>
        {groups.map((g, gi) => (
          <div key={gi} style={{ marginTop: flat || gi === 0 ? 0 : "var(--space-2)" }}>
            {g.group && <p style={groupHeadingStyle}>{g.group}</p>}
            <ul style={{ ...listStyle, color }}>
              {g.items.map((ing, i) => (
                <li key={i} style={itemStyle}>
                  {formatIngredient(ing)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  const lines = parseIngredients(text);
  if (!lines.length) return null;
  return (
    <ul style={{ ...listStyle, color }}>
      {lines.map((line, i) => (
        <li key={i} style={itemStyle}>
          {line}
        </li>
      ))}
    </ul>
  );
}

const listStyle: React.CSSProperties = {
  fontSize: "var(--t-meta)",
  lineHeight: 1.6,
  listStyle: "disc outside",
  paddingLeft: "1.1em",
  margin: 0,
};

const itemStyle: React.CSSProperties = { marginBottom: "0.15em" };

const groupHeadingStyle: React.CSSProperties = {
  fontSize: "var(--t-meta)",
  fontWeight: 600,
  color: "var(--color-text)",
  margin: "0 0 0.2em",
};
