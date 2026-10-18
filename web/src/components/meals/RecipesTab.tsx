"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { IngredientList } from "./IngredientList";
import { MEAL_TYPES, ctaStyle, inputStyle, type MealType, type RecipeRow } from "./meals-shared";

// ─── Recipes Tab ──────────────────────────────────────────────────────────────

export function RecipesTab({ recipes }: { recipes: RecipeRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [useRecipeId, setUseRecipeId] = useState<string | null>(null);
  const [useRecipeMealType, setUseRecipeMealType] = useState<MealType>("lunch");
  const [logging, setLogging] = useState(false);

  const q = query.toLowerCase();
  const filtered = q
    ? recipes.filter((r) => {
        const haystack = [r.name, r.cuisine, ...(r.tags ?? []), r.ingredients ?? ""]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
    : recipes;

  async function handleUseRecipe(recipeId: string) {
    setLogging(true);
    try {
      const recipe = recipes.find((r) => r.id === recipeId);
      const res = await fetch("/api/meals/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meal_type: useRecipeMealType,
          recipe_id: recipeId,
          notes: recipe?.name ?? null,
        }),
      });
      if (!res.ok) throw new Error("Failed to log meal");
      setUseRecipeId(null);
      router.refresh();
    } finally {
      setLogging(false);
    }
  }

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-5)" }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search recipes, ingredients, tags…"
        style={inputStyle}
      />

      {filtered.length === 0 ? (
        <p
          style={{
            fontSize: "var(--t-body)",
            color: "var(--color-text-faint)",
            paddingTop: "var(--space-4)",
          }}
        >
          {recipes.length === 0 ? "No saved recipes yet." : "No recipes match your search."}
        </p>
      ) : (
        <div>
          {filtered.map((r, i) => {
            const isExpanded = expandedId === r.id;
            const isUsing = useRecipeId === r.id;
            return (
              <div
                key={r.id}
                className="card-lift"
                style={{
                  borderTop: i > 0 ? "1px solid var(--rule-soft)" : "none",
                  borderRadius: "var(--r-1)",
                  transition: "background var(--motion-fast) var(--ease-out-quart)",
                }}
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  className="w-full text-left flex items-start justify-between"
                  style={{
                    gap: "var(--space-3)",
                    padding: "var(--space-3) 0",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: "var(--t-body)",
                        fontWeight: 600,
                        color: "var(--color-text)",
                      }}
                    >
                      {r.name}
                    </p>
                    {r.cuisine && (
                      <p
                        style={{
                          fontSize: "var(--t-micro)",
                          color: "var(--color-text-muted)",
                          marginTop: 2,
                        }}
                      >
                        {r.cuisine}
                      </p>
                    )}
                    {r.tags && r.tags.length > 0 && (
                      <div
                        className="flex flex-wrap"
                        style={{ gap: "var(--space-1)", marginTop: "var(--space-2)" }}
                      >
                        {r.tags.map((tag) => (
                          <span
                            key={tag}
                            style={{
                              fontSize: "var(--t-micro)",
                              color: "var(--color-text-muted)",
                              border: "1px solid var(--rule-soft)",
                              borderRadius: "var(--r-1)",
                              padding: "2px var(--space-2)",
                            }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {isExpanded ? (
                    <ChevronUp
                      size={15}
                      style={{
                        color: "var(--color-text-faint)",
                        flexShrink: 0,
                        marginTop: "var(--space-1)",
                      }}
                    />
                  ) : (
                    <ChevronDown
                      size={15}
                      style={{
                        color: "var(--color-text-faint)",
                        flexShrink: 0,
                        marginTop: "var(--space-1)",
                      }}
                    />
                  )}
                </button>

                {isExpanded && (
                  <div
                    style={{
                      padding: "var(--space-3) 0 var(--space-4)",
                      borderTop: "1px solid var(--rule-soft)",
                    }}
                  >
                    {r.ingredients && (
                      <div style={{ marginBottom: "var(--space-3)" }}>
                        <IngredientList
                          items={r.ingredients_json}
                          text={r.ingredients}
                          tone="muted"
                        />
                      </div>
                    )}

                    {r.instructions && (
                      <div style={{ marginBottom: "var(--space-3)" }}>
                        <p
                          style={{
                            fontSize: "var(--t-micro)",
                            fontWeight: 600,
                            color: "var(--color-text-muted)",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            marginBottom: "var(--space-1)",
                          }}
                        >
                          How to make it
                        </p>
                        <p
                          style={{
                            fontSize: "var(--t-meta)",
                            color: "var(--color-text)",
                            lineHeight: 1.6,
                            whiteSpace: "pre-line",
                          }}
                        >
                          {r.instructions}
                        </p>
                      </div>
                    )}

                    {isUsing ? (
                      <div
                        className="flex items-center flex-wrap"
                        style={{ gap: "var(--space-2)" }}
                      >
                        <select
                          aria-label="Meal type"
                          value={useRecipeMealType}
                          onChange={(e) => setUseRecipeMealType(e.target.value as MealType)}
                          style={{ ...inputStyle, width: "auto", minWidth: 110 }}
                        >
                          {MEAL_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t.charAt(0).toUpperCase() + t.slice(1)}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleUseRecipe(r.id)}
                          disabled={logging}
                          className="flex items-center transition-opacity active:opacity-70 disabled:opacity-40"
                          style={{ ...ctaStyle, gap: "var(--space-1)" }}
                        >
                          {logging ? <Loader2 size={14} className="animate-spin" /> : "Log"}
                        </button>
                        <button
                          onClick={() => setUseRecipeId(null)}
                          style={{
                            fontSize: "var(--t-micro)",
                            color: "var(--color-text-muted)",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "var(--space-1) var(--space-2)",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setUseRecipeId(r.id)}
                        className="transition-opacity active:opacity-70"
                        style={ctaStyle}
                      >
                        Use this recipe
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
