import { parseIngredients } from "@/lib/units";

/**
 * A recipe's ingredients, one per line.
 *
 * Both places that show ingredients (the planned-meal detail and the recipe browser) used to render
 * the raw column into a single `<p>` with `white-space: pre-line`. That worked only as long as the
 * column held clean newline text — when a batch script wrote a JSON array into it, the page printed
 * the JSON. Parsing lives in `parseIngredients`, which also annotates units and rice `go`; this
 * component is the shared shell so the two call sites cannot drift apart again.
 *
 * A real `<ul>` rather than a text blob: an ingredient list IS a list, and screen readers announce
 * the item count, which a pre-line paragraph does not.
 */
export function IngredientList({
  text,
  tone = "default",
}: {
  text: string | null | undefined;
  tone?: "default" | "muted";
}) {
  const items = parseIngredients(text);
  if (!items.length) return null;

  return (
    <ul
      style={{
        fontSize: "var(--t-meta)",
        color: tone === "muted" ? "var(--color-text-muted)" : "var(--color-text)",
        lineHeight: 1.6,
        listStyle: "disc outside",
        paddingLeft: "1.1em",
        margin: 0,
      }}
    >
      {items.map((line, i) => (
        <li key={i} style={{ marginBottom: "0.15em" }}>
          {line}
        </li>
      ))}
    </ul>
  );
}
