"use client";

import { useState } from "react";

import { FoodArt } from "./food-art";
import {
  macroGap,
  macrosForItem,
  type Per100g,
  type ResolvedMacros,
} from "@/lib/nutrition/inventory-macros";
import { freshnessOf, daysText, isSpent } from "@/lib/nutrition/inventory-freshness";

/**
 * The kitchen as three doors you open, rather than a list you read.
 *
 * The list view still exists and still owns every mutation — add, edit, move, remove. This is
 * deliberately READ-ONLY: it answers "what have I got and what is in it", which is the question
 * asked while standing in the kitchen deciding what to cook. Splitting it that way means this
 * screen can be dense and visual without re-implementing (and drifting from) the edit paths.
 *
 * Spent rows never appear here at all — same rule as the list.
 */

export interface FridgeItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  location: string;
  category: string | null;
  expires_on: string | null;
  image_key: string | null;
  macros_per_100g: Per100g | null;
  macros_source: string | null;
}

const DOORS = [
  { loc: "fridge", label: "Fridge", hint: "Cook these first" },
  { loc: "freezer", label: "Freezer", hint: "Next week's protein" },
  { loc: "pantry", label: "Pantry", hint: "Staples & tins" },
] as const;

// Grams in, grams + oz/lb out. The house rule: recipes are written in grams and shopping is
// done in lb/oz, so showing one forces mental arithmetic at exactly the wrong moment.
function qtyLabel(item: FridgeItem): string {
  const { quantity: q, unit: u } = item;
  if (q == null) return "staple";
  const n = (x: number, d = 0) => x.toFixed(d).replace(/\.0+$/, "");
  if (u === "g") {
    const alts = [`${n(q / 28.3495, 1)} oz`];
    if (q >= 453.592) alts.push(`${n(q / 453.592, 2)} lb`);
    return `${n(q)} g (${alts.join(" · ")})`;
  }
  if (u === "oz") return `${n(q, 2)} oz (${n(q * 28.3495)} g)`;
  if (u === "lb") return `${n(q, 2)} lb (${n(q * 453.592)} g)`;
  return `${n(q, 2)} ${u ?? ""}`.trim();
}

function MacroLine({ m }: { m: ResolvedMacros }) {
  return (
    <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
      {(
        [
          ["kcal", m.calories],
          ["P", m.protein_g],
          ["C", m.carbs_g],
          ["F", m.fat_g],
          ...(m.fiber_g != null ? ([["fib", m.fiber_g]] as [string, number][]) : []),
        ] as [string, number][]
      ).map(([k, v]) => (
        <span key={k} className="tnum" style={{ fontSize: "var(--t-micro)" }}>
          <span style={{ color: "var(--color-text)" }}>{v}</span>{" "}
          <span style={{ color: "var(--color-text-faint)" }}>{k}</span>
        </span>
      ))}
    </div>
  );
}

function Detail({ item, onClose }: { item: FridgeItem; onClose: () => void }) {
  const macros = macrosForItem(item.macros_per_100g, item.quantity, item.unit);
  const gap = macroGap(item.macros_per_100g, item.quantity, item.unit);
  const f = freshnessOf(item);

  return (
    <div
      style={{
        marginTop: "var(--space-3)",
        padding: "var(--space-3)",
        borderRadius: 10,
        background: "var(--rule-soft)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)" }}>
        <FoodArt imageKey={item.image_key} category={item.category} size={56} />
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <div style={{ fontSize: "var(--t-body)", color: "var(--color-text)" }}>{item.name}</div>
          <div
            className="tnum"
            style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)", marginTop: 2 }}
          >
            {qtyLabel(item)}
            {f.days != null && (
              <>
                {" · "}
                <span style={{ color: f.kind === "urgent" ? "var(--color-danger)" : undefined }}>
                  {daysText(f.days)}
                </span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--color-text-faint)",
            fontSize: "var(--t-micro)",
          }}
        >
          Close
        </button>
      </div>

      <div style={{ marginTop: "var(--space-3)" }}>
        {macros ? (
          <>
            <div
              style={{
                fontSize: "var(--t-micro)",
                color: "var(--color-text-faint)",
                marginBottom: 4,
              }}
            >
              All of it ({qtyLabel(item)})
            </div>
            <MacroLine m={macros} />
          </>
        ) : (
          // Never a silent dash: "we don't know" and "it has none" are different facts.
          <div style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}>{gap}</div>
        )}

        {item.macros_per_100g && (
          <div
            style={{
              marginTop: "var(--space-2)",
              fontSize: "var(--t-micro)",
              color: "var(--color-text-faint)",
            }}
          >
            {item.macros_per_100g.calories} kcal · {item.macros_per_100g.protein_g} P per 100 g
            {item.macros_per_100g.prep_state ? ` · ${item.macros_per_100g.prep_state}` : ""}
            {item.macros_per_100g.basis ? (
              <div style={{ marginTop: 2 }}>
                {item.macros_source === "label" ? "Label" : "USDA"}: {item.macros_per_100g.basis}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function Door({ door, items }: { door: (typeof DOORS)[number]; items: FridgeItem[] }) {
  const [open, setOpen] = useState(door.loc === "fridge");
  const [selected, setSelected] = useState<string | null>(null);
  const item = items.find((i) => i.id === selected) ?? null;

  return (
    <section style={{ marginBottom: "var(--space-4)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          padding: "var(--space-3)",
          borderRadius: 12,
          border: "1px solid var(--rule-soft)",
          background: open ? "var(--rule-soft)" : "transparent",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: "var(--t-body)", color: "var(--color-text)", flex: "1 1 auto" }}>
          {door.label}
        </span>
        <span
          className="tnum"
          style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}
        >
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
        <span style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}>
          {open ? "Close" : "Open"}
        </span>
      </button>

      {open && (
        <>
          <p
            style={{
              margin: "var(--space-2) 0 var(--space-2) 2px",
              fontSize: "var(--t-micro)",
              color: "var(--color-text-faint)",
            }}
          >
            {door.hint}
          </p>
          {items.length === 0 ? (
            <p style={{ fontSize: "var(--t-micro)", color: "var(--color-text-faint)" }}>Empty.</p>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))",
                gap: "var(--space-2)",
              }}
            >
              {items.map((i) => {
                const f = freshnessOf(i);
                return (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setSelected(selected === i.id ? null : i.id)}
                    aria-pressed={selected === i.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 4,
                      padding: "var(--space-2)",
                      borderRadius: 10,
                      border:
                        selected === i.id
                          ? "1px solid var(--color-text-faint)"
                          : "1px solid transparent",
                      background: "var(--rule-soft)",
                      cursor: "pointer",
                      // Fixed height + a clamped name keeps the grid rows even. Without both, a
                      // name like "Starbucks Medium Roast Iced Coffee, Black Unsweetened
                      // (48 fl oz)" wraps to five lines and sets the height of its whole row.
                      // The full name is one tap away in the detail panel.
                      minHeight: 126,
                      justifyContent: "flex-start",
                    }}
                  >
                    <FoodArt imageKey={i.image_key} category={i.category} size={44} />
                    <span
                      style={{
                        fontSize: "var(--t-micro)",
                        color: "var(--color-text)",
                        textAlign: "center",
                        lineHeight: 1.25,
                        overflowWrap: "break-word",
                        minWidth: 0,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {i.name}
                    </span>
                    <span
                      className="tnum"
                      style={{
                        fontSize: 10,
                        color: "var(--color-text-faint)",
                        textAlign: "center",
                        marginTop: "auto",
                      }}
                    >
                      {qtyLabel(i)}
                    </span>
                    {f.days != null && f.kind === "urgent" && (
                      <span className="tnum" style={{ fontSize: 10, color: "var(--color-danger)" }}>
                        {daysText(f.days)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {item && <Detail item={item} onClose={() => setSelected(null)} />}
        </>
      )}
    </section>
  );
}

export function FridgeView({ items }: { items: FridgeItem[] }) {
  // Same rule as the list: a spent row is history, not food.
  const live = items.filter((i) => !isSpent(i));

  return (
    <div>
      {DOORS.map((d) => (
        <Door
          key={d.loc}
          door={d}
          items={live
            .filter((i) => i.location === d.loc)
            .sort((a, b) => {
              // Soonest-to-expire first, undated last — what to cook next, at the top.
              const ax = a.expires_on ?? "9999";
              const bx = b.expires_on ?? "9999";
              return ax === bx ? a.name.localeCompare(b.name) : ax < bx ? -1 : 1;
            })}
        />
      ))}
    </div>
  );
}
