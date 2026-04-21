"use client";

import { useState, useTransition } from "react";
import { Plus, X, Loader2 } from "lucide-react";

export interface EquipmentItem {
  id: string;
  equipment_type: string;
  weight_lbs: number | null;
  resistance_level: string | null;
  count: number;
  notes: string | null;
}

export interface EquipmentItemInput {
  equipment_type: string;
  weight_lbs: number | null;
  resistance_level: string | null;
  count: number;
  notes: string | null;
}

interface Props {
  items: EquipmentItem[];
  addAction: (item: EquipmentItemInput) => Promise<void>;
  removeAction: (id: string) => Promise<void>;
}

const STOCK_TYPES = [
  "dumbbell pair",
  "barbell",
  "plate set",
  "kettlebell",
  "resistance band",
  "slider",
  "pull-up bar",
];

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatItem(item: EquipmentItem): string {
  const parts: string[] = [titleCase(item.equipment_type)];
  if (item.weight_lbs != null) parts.push(`${item.weight_lbs} lbs`);
  if (item.resistance_level) parts.push(item.resistance_level);
  if (item.count !== 1) parts.push(`×${item.count}`);
  return parts.join(" · ");
}

export function EquipmentSettings({ items, addAction, removeAction }: Props) {
  const [list, setList] = useState<EquipmentItem[]>(items);
  const [type, setType] = useState(STOCK_TYPES[0]);
  const [customType, setCustomType] = useState("");
  const [weight, setWeight] = useState("");
  const [resistance, setResistance] = useState("");
  const [count, setCount] = useState("1");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const effectiveType = type === "_custom" ? customType.trim() : type;
  const isWeightBased = ["dumbbell pair", "barbell", "plate set", "kettlebell"].includes(effectiveType);

  async function handleAdd() {
    if (!effectiveType) {
      setError("Equipment type is required.");
      return;
    }
    const parsedWeight = weight ? parseFloat(weight) : null;
    const parsedCount = parseInt(count, 10) || 1;
    if (weight && (isNaN(parsedWeight!) || parsedWeight! <= 0)) {
      setError("Weight must be a positive number.");
      return;
    }

    const newItem: EquipmentItemInput = {
      equipment_type: effectiveType,
      weight_lbs: parsedWeight,
      resistance_level: resistance.trim() || null,
      count: parsedCount,
      notes: notes.trim() || null,
    };

    setError(null);
    startTransition(async () => {
      await addAction(newItem);
      // Optimistic update: add a placeholder row (id unknown until revalidation)
      setList((prev) => [
        ...prev,
        { ...newItem, id: `pending-${Date.now()}` } as EquipmentItem,
      ]);
      setWeight("");
      setResistance("");
      setNotes("");
      setCount("1");
    });
  }

  function handleRemove(id: string) {
    setList((prev) => prev.filter((i) => i.id !== id));
    startTransition(async () => {
      await removeAction(id);
    });
  }

  return (
    <section
      style={{
        paddingTop: "var(--space-6)",
        paddingBottom: "var(--space-6)",
        borderBottom: "1px solid var(--rule-soft)",
      }}
    >
      <h2 className="db-section-label">Equipment</h2>
      <p
        style={{
          fontSize: "var(--t-micro)",
          color: "var(--color-text-muted)",
          marginBottom: "var(--space-3)",
        }}
      >
        Mr. Bridge reads this before proposing workout weights — only exercises within your
        inventory will be suggested.
      </p>

      {/* Add form */}
      <div
        style={{
          borderBottom: "1px solid var(--rule)",
          paddingTop: "var(--space-2)",
          paddingBottom: "var(--space-3)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
          <Plus size={16} style={{ color: "var(--accent)", flexShrink: 0 }} aria-hidden />
          <select
            aria-label="Equipment type"
            value={type}
            onChange={(e) => { setType(e.target.value); setError(null); }}
            className="flex-1 bg-transparent focus:outline-none min-w-0"
            style={{
              color: "var(--color-text)",
              fontSize: "var(--t-body)",
              caretColor: "var(--accent)",
              minHeight: 44,
              border: "none",
            }}
          >
            {STOCK_TYPES.map((t) => (
              <option key={t} value={t}>
                {titleCase(t)}
              </option>
            ))}
            <option value="_custom">Custom…</option>
          </select>
        </div>

        {type === "_custom" && (
          <input
            value={customType}
            onChange={(e) => { setCustomType(e.target.value); setError(null); }}
            placeholder="Equipment name"
            className="bg-transparent focus:outline-none"
            style={{
              color: "var(--color-text)",
              fontSize: "var(--t-body)",
              border: "none",
              borderBottom: "1px solid var(--rule-soft)",
              minHeight: 36,
              paddingLeft: "calc(16px + var(--space-3))",
            }}
          />
        )}

        <div
          className="flex items-center flex-wrap"
          style={{ gap: "var(--space-2)", paddingLeft: "calc(16px + var(--space-3))" }}
        >
          {isWeightBased && (
            <input
              type="number"
              value={weight}
              onChange={(e) => { setWeight(e.target.value); setError(null); }}
              placeholder="Weight (lbs)"
              min={0}
              step={2.5}
              className="bg-transparent focus:outline-none"
              style={{
                color: "var(--color-text)",
                fontSize: "var(--t-micro)",
                border: "1px solid var(--rule)",
                borderRadius: "var(--r-1)",
                padding: "4px 8px",
                width: 120,
              }}
            />
          )}
          {!isWeightBased && (
            <input
              value={resistance}
              onChange={(e) => { setResistance(e.target.value); setError(null); }}
              placeholder="Resistance (e.g. medium)"
              className="bg-transparent focus:outline-none"
              style={{
                color: "var(--color-text)",
                fontSize: "var(--t-micro)",
                border: "1px solid var(--rule)",
                borderRadius: "var(--r-1)",
                padding: "4px 8px",
                width: 160,
              }}
            />
          )}
          <input
            type="number"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            placeholder="Qty"
            min={1}
            className="bg-transparent focus:outline-none"
            style={{
              color: "var(--color-text)",
              fontSize: "var(--t-micro)",
              border: "1px solid var(--rule)",
              borderRadius: "var(--r-1)",
              padding: "4px 8px",
              width: 64,
            }}
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="bg-transparent focus:outline-none flex-1"
            style={{
              color: "var(--color-text)",
              fontSize: "var(--t-micro)",
              border: "1px solid var(--rule)",
              borderRadius: "var(--r-1)",
              padding: "4px 8px",
              minWidth: 100,
            }}
          />
          <button
            onClick={handleAdd}
            disabled={isPending || !effectiveType}
            className="flex items-center justify-center flex-shrink-0 cursor-pointer disabled:opacity-30 disabled:cursor-default"
            style={{
              gap: "var(--space-1)",
              padding: "0 var(--space-3)",
              minHeight: 32,
              minWidth: 64,
              background: "var(--accent)",
              color: "var(--color-text-on-cta)",
              border: "1px solid var(--accent)",
              borderRadius: "var(--r-1)",
              fontSize: "var(--t-micro)",
              fontWeight: 500,
              letterSpacing: "0.02em",
              transition: "opacity var(--motion-fast) var(--ease-out-quart)",
            }}
          >
            {isPending ? <Loader2 size={12} className="animate-spin" /> : "Add"}
          </button>
        </div>
        {error && (
          <p style={{ fontSize: "var(--t-micro)", color: "var(--color-danger)", marginLeft: "calc(16px + var(--space-3))" }}>
            {error}
          </p>
        )}
      </div>

      {/* Equipment list */}
      {list.length === 0 ? (
        <p
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-text-faint)",
            paddingTop: "var(--space-4)",
          }}
        >
          No equipment added yet.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {list.map((item, i) => (
            <li
              key={item.id}
              className="flex items-center justify-between"
              style={{
                paddingTop: "var(--space-3)",
                paddingBottom: "var(--space-3)",
                gap: "var(--space-3)",
                borderTop: i === 0 ? "none" : "1px solid var(--rule-soft)",
                minHeight: 44,
              }}
            >
              <span
                style={{
                  fontSize: "var(--t-meta)",
                  fontWeight: 500,
                  color: "var(--color-text)",
                }}
              >
                {formatItem(item)}
                {item.notes && (
                  <span
                    style={{
                      fontSize: "var(--t-micro)",
                      color: "var(--color-text-muted)",
                      fontWeight: 400,
                      marginLeft: "var(--space-2)",
                    }}
                  >
                    — {item.notes}
                  </span>
                )}
              </span>
              <button
                onClick={() => handleRemove(item.id)}
                disabled={isPending || item.id.startsWith("pending-")}
                className="flex items-center justify-center cursor-pointer disabled:opacity-40 hover-text-danger"
                style={{
                  width: 44,
                  height: 44,
                  color: "var(--color-text-faint)",
                  background: "transparent",
                  border: "none",
                  borderRadius: "var(--r-1)",
                  transition: "color var(--motion-fast) var(--ease-out-quart)",
                }}
                title={`Remove ${item.equipment_type}`}
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
