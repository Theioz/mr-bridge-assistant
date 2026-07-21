"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The kitchen inventory: raw ingredients on hand, action-first.
 *
 * The page's real job is "what do I cook before it turns?", which a flat list buries. So the
 * urgent items (expiring within a few days) are lifted into a "Use soon" strip at the top, and
 * everything else sits under its location with a freshness dot. Moving an item to the freezer is
 * one tap — that is how "I froze it" gets recorded, and how the planner learns the steak is
 * next-week food.
 *
 * No macros here by design — an inventory item is a location + rough quantity + a fresh window,
 * never a nutrition record. It has no link to recipes, cooks or meal plans, so editing it can
 * never change a macro total or a plan.
 */

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  location: string;
  category: string | null;
  added_date: string;
  expires_on: string | null;
  notes: string | null;
}

const LOCATIONS = ["fridge", "freezer", "pantry", "counter"] as const;
const LOCATION_LABEL: Record<string, string> = {
  fridge: "Fridge",
  freezer: "Freezer",
  pantry: "Pantry",
  counter: "Counter",
};

// An item this close to (or past) its date is what the next cook should spend first.
const USE_SOON_DAYS = 3;

function daysUntil(dateStr: string): number {
  const then = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((then.getTime() - now.getTime()) / 86_400_000);
}

type Freshness = "urgent" | "fine" | "stable" | "frozen";

// Frozen items don't expire on a fridge clock; a dated fridge/counter item is urgent inside the
// window and fine outside it; an undated staple (rice, oil) is simply stable.
function freshnessOf(item: InventoryItem): { kind: Freshness; days: number | null } {
  if (item.location === "freezer") return { kind: "frozen", days: null };
  if (item.expires_on) {
    const d = daysUntil(item.expires_on);
    return { kind: d <= USE_SOON_DAYS ? "urgent" : "fine", days: d };
  }
  return { kind: "stable", days: null };
}

function daysText(d: number): string {
  if (d < 0) return "expired";
  if (d === 0) return "today";
  return `${d}d`;
}

function quantityLabel(item: InventoryItem): string {
  if (item.quantity == null) return item.unit ?? "on hand";
  const qty = String(Number(item.quantity));
  return item.unit ? `${qty} ${item.unit}` : qty;
}

// A single freshness marker: filled danger dot (urgent), hollow ring (fine), small square
// (frozen), faint dot (undated staple). Colour comes from tokens so both themes stay legible.
function FreshnessDot({ kind }: { kind: Freshness }) {
  const base: React.CSSProperties = {
    display: "inline-block",
    width: 8,
    height: 8,
    boxSizing: "border-box",
    flexShrink: 0,
  };
  const style: React.CSSProperties =
    kind === "urgent"
      ? { ...base, borderRadius: "50%", background: "var(--color-danger)" }
      : kind === "frozen"
        ? { ...base, borderRadius: 2, background: "var(--color-text-faint)" }
        : kind === "fine"
          ? { ...base, borderRadius: "50%", border: "1.5px solid var(--color-text-faint)" }
          : { ...base, borderRadius: "50%", background: "var(--rule-soft)" };
  return <span aria-hidden style={style} />;
}

interface InventoryPanelProps {
  items: InventoryItem[];
}

const EMPTY_FORM = {
  name: "",
  quantity: "",
  unit: "",
  location: "fridge",
  category: "",
  expires_on: "",
  notes: "",
};
type FormState = typeof EMPTY_FORM;

export function InventoryPanel({ items }: InventoryPanelProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<FormState>(EMPTY_FORM);

  // Every mutation writes through the API then invalidates the server component, same pattern
  // as KitchenPanel — no local cache to keep in sync.
  async function call(url: string, method: string, body?: unknown): Promise<boolean> {
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "Something went wrong");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Something went wrong");
      return false;
    }
  }

  async function move(item: InventoryItem, location: string) {
    if (location === item.location) return;
    setBusyId(item.id);
    await call(`/api/inventory/${item.id}`, "PATCH", { location });
    setBusyId(null);
  }

  async function remove(id: string) {
    setBusyId(id);
    await call(`/api/inventory/${id}`, "DELETE");
    setBusyId(null);
  }

  function startEdit(item: InventoryItem) {
    setAdding(false);
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      quantity: item.quantity == null ? "" : String(item.quantity),
      unit: item.unit ?? "",
      location: item.location,
      category: item.category ?? "",
      expires_on: item.expires_on ?? "",
      notes: item.notes ?? "",
    });
  }

  async function saveEdit(id: string) {
    setBusyId(id);
    const ok = await call(`/api/inventory/${id}`, "PATCH", {
      name: editForm.name,
      quantity: editForm.quantity === "" ? null : editForm.quantity,
      unit: editForm.unit,
      location: editForm.location,
      category: editForm.category,
      expires_on: editForm.expires_on || null,
      notes: editForm.notes,
    });
    setBusyId(null);
    if (ok) setEditingId(null);
  }

  async function addItem() {
    if (!addForm.name.trim()) {
      setError("Name is required");
      return;
    }
    setBusyId("__add__");
    const ok = await call("/api/inventory", "POST", {
      name: addForm.name,
      quantity: addForm.quantity === "" ? null : addForm.quantity,
      unit: addForm.unit,
      location: addForm.location,
      category: addForm.category,
      expires_on: addForm.expires_on || null,
      notes: addForm.notes,
    });
    setBusyId(null);
    if (ok) {
      setAddForm(EMPTY_FORM);
      setAdding(false);
    }
  }

  const useSoon = items
    .filter((i) => freshnessOf(i).kind === "urgent")
    .sort((a, b) => daysUntil(a.expires_on as string) - daysUntil(b.expires_on as string));

  const byLocation = LOCATIONS.map((loc) => ({
    loc,
    rows: items.filter((i) => i.location === loc),
  })).filter((g) => g.rows.length > 0);

  return (
    <section style={{ marginBottom: "var(--space-6)" }}>
      {error && (
        <p
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-danger)",
            marginBottom: "var(--space-3)",
          }}
        >
          {error}
        </p>
      )}

      {/* Add — top-right trigger, expands to the shared form. */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-4)" }}>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} style={addTriggerStyle}>
            + Add item
          </button>
        )}
      </div>

      {adding && (
        <div style={{ ...editRowStyle, marginBottom: "var(--space-5)" }}>
          <FormFields form={addForm} setForm={setAddForm} />
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button
              type="button"
              disabled={busyId === "__add__"}
              onClick={addItem}
              style={ctaButtonStyle(busyId === "__add__")}
            >
              {busyId === "__add__" ? "Adding…" : "Add item"}
            </button>
            <button
              type="button"
              disabled={busyId === "__add__"}
              onClick={() => {
                setAdding(false);
                setAddForm(EMPTY_FORM);
              }}
              style={quietButtonStyle(busyId === "__add__")}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Use soon — the triage strip. Read-only highlight; act on items in their location below. */}
      {useSoon.length > 0 && (
        <div style={useSoonBoxStyle}>
          <p style={useSoonHeaderStyle}>Use soon · {useSoon.length}</p>
          {useSoon.map((item) => {
            const f = freshnessOf(item);
            return (
              <div key={item.id} style={useSoonRowStyle}>
                <FreshnessDot kind="urgent" />
                <span style={{ flex: 1, minWidth: 0, color: "var(--color-text)" }}>
                  {item.name}
                </span>
                <span style={useSoonMetaStyle}>
                  {LOCATION_LABEL[item.location]}
                  {f.days != null ? ` · ${daysText(f.days)}` : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {items.length === 0 && (
        <p
          style={{
            fontSize: "var(--t-body)",
            color: "var(--color-text-muted)",
            marginBottom: "var(--space-4)",
          }}
        >
          Nothing tracked yet — add what&apos;s in your kitchen.
        </p>
      )}

      {byLocation.map(({ loc, rows }) => (
        <div key={loc} style={{ marginBottom: "var(--space-5)" }}>
          <div style={sectionHeaderStyle}>
            <span style={labelStyle}>{LOCATION_LABEL[loc]}</span>
            <span style={countStyle}>{rows.length}</span>
          </div>
          {rows.map((item) => {
            if (editingId === item.id) {
              return (
                <div key={item.id} style={editRowStyle}>
                  <FormFields form={editForm} setForm={setEditForm} />
                  <div style={{ display: "flex", gap: "var(--space-2)" }}>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => saveEdit(item.id)}
                      style={ctaButtonStyle(busyId === item.id)}
                    >
                      {busyId === item.id ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => setEditingId(null)}
                      style={quietButtonStyle(busyId === item.id)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            }
            const f = freshnessOf(item);
            return (
              <div key={item.id} style={rowStyle}>
                <div style={{ display: "flex", alignItems: "center", minWidth: 0, flex: 1 }}>
                  <FreshnessDot kind={f.kind} />
                  <div style={{ minWidth: 0, marginLeft: "var(--space-2)" }}>
                    <span style={nameStyle}>{item.name}</span>
                    <span style={subStyle}>
                      {quantityLabel(item)}
                      {item.category ? ` · ${item.category}` : ""}
                      {f.days != null ? " · " : ""}
                      {f.days != null && (
                        <span
                          style={{
                            color: f.kind === "urgent" ? "var(--color-danger)" : undefined,
                          }}
                        >
                          {daysText(f.days)}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
                  <select
                    value={item.location}
                    disabled={busyId === item.id}
                    onChange={(e) => move(item, e.target.value)}
                    aria-label={`Move ${item.name} to another location`}
                    style={selectStyle}
                  >
                    {LOCATIONS.map((l) => (
                      <option key={l} value={l}>
                        {LOCATION_LABEL[l]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => startEdit(item)}
                    style={quietButtonStyle(busyId === item.id)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => remove(item.id)}
                    style={quietButtonStyle(busyId === item.id)}
                    title="Remove — used up or thrown out."
                  >
                    {busyId === item.id ? "…" : "Remove"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {items.length > 0 && (
        <div style={legendStyle}>
          <span style={legendItemStyle}>
            <FreshnessDot kind="urgent" /> use soon
          </span>
          <span style={legendItemStyle}>
            <FreshnessDot kind="fine" /> fine
          </span>
          <span style={legendItemStyle}>
            <FreshnessDot kind="frozen" /> frozen
          </span>
        </div>
      )}
    </section>
  );
}

function FormFields({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (updater: (f: FormState) => FormState) => void;
}) {
  const set =
    (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
      <input
        value={form.name}
        onChange={set("name")}
        placeholder="Name"
        aria-label="Name"
        style={{ ...inputStyle, flex: "2 1 140px" }}
      />
      <input
        value={form.quantity}
        onChange={set("quantity")}
        placeholder="Qty"
        inputMode="decimal"
        aria-label="Quantity"
        style={{ ...inputStyle, flex: "1 1 60px" }}
      />
      <input
        value={form.unit}
        onChange={set("unit")}
        placeholder="Unit"
        aria-label="Unit"
        style={{ ...inputStyle, flex: "1 1 70px" }}
      />
      <select
        value={form.location}
        onChange={set("location")}
        aria-label="Location"
        style={{ ...selectStyle, flex: "1 1 90px" }}
      >
        {LOCATIONS.map((l) => (
          <option key={l} value={l}>
            {LOCATION_LABEL[l]}
          </option>
        ))}
      </select>
      <input
        value={form.category}
        onChange={set("category")}
        placeholder="Category"
        aria-label="Category"
        style={{ ...inputStyle, flex: "1 1 90px" }}
      />
      <input
        value={form.expires_on}
        onChange={set("expires_on")}
        type="date"
        aria-label="Expires on"
        style={{ ...inputStyle, flex: "1 1 130px" }}
      />
      <input
        value={form.notes}
        onChange={set("notes")}
        placeholder="Notes"
        aria-label="Notes"
        style={{ ...inputStyle, flex: "3 1 160px" }}
      />
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  fontWeight: 500,
  color: "var(--color-text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "var(--space-2)",
  marginBottom: "var(--space-2)",
};

const countStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  color: "var(--color-text-faint)",
  fontVariantNumeric: "tabular-nums",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-4)",
  padding: "var(--space-3) 0",
  borderBottom: "1px solid var(--rule-soft)",
};

const editRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
  padding: "var(--space-3) 0",
  borderBottom: "1px solid var(--rule-soft)",
};

const nameStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--t-body)",
  color: "var(--color-text)",
};

const subStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
  marginTop: 2,
};

// Use-soon triage strip — a quiet warning-tinted box so it reads as "attention" without shouting.
const useSoonBoxStyle: React.CSSProperties = {
  background: "var(--warning-subtle)",
  border: "1px solid var(--rule-soft)",
  borderRadius: "var(--r-2)",
  padding: "var(--space-3) var(--space-4)",
  marginBottom: "var(--space-5)",
};

const useSoonHeaderStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  fontWeight: 600,
  color: "var(--color-danger)",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  marginBottom: "var(--space-2)",
};

const useSoonRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  fontSize: "var(--t-meta)",
  padding: "var(--space-1) 0",
};

const useSoonMetaStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
  flexShrink: 0,
  fontVariantNumeric: "tabular-nums",
};

const legendStyle: React.CSSProperties = {
  display: "flex",
  gap: "var(--space-4)",
  marginTop: "var(--space-2)",
};

const legendItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-1)",
  fontSize: "var(--t-micro)",
  color: "var(--color-text-faint)",
};

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--font-body), system-ui, sans-serif",
  fontSize: "var(--t-micro)",
  color: "var(--color-text)",
  background: "var(--color-surface)",
  border: "1px solid var(--rule-soft)",
  borderRadius: "var(--r-1)",
  padding: "0 var(--space-2)",
  minHeight: 36,
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

const addTriggerStyle: React.CSSProperties = {
  fontFamily: "var(--font-body), system-ui, sans-serif",
  fontSize: "var(--t-micro)",
  fontWeight: 500,
  color: "var(--color-text-muted)",
  background: "transparent",
  border: "1px dashed var(--rule-soft)",
  borderRadius: "var(--r-1)",
  padding: "0 var(--space-4)",
  minHeight: 36,
  cursor: "pointer",
};

function quietButtonStyle(pending: boolean): React.CSSProperties {
  return {
    fontFamily: "var(--font-body), system-ui, sans-serif",
    fontSize: "var(--t-micro)",
    fontWeight: 500,
    color: "var(--color-text-muted)",
    background: "transparent",
    border: "1px solid var(--rule-soft)",
    borderRadius: "var(--r-1)",
    padding: "0 var(--space-3)",
    minHeight: 36,
    flexShrink: 0,
    cursor: pending ? "wait" : "pointer",
    opacity: pending ? 0.5 : 1,
    transition: "opacity var(--motion-fast) var(--ease-out-quart)",
  };
}

function ctaButtonStyle(pending: boolean): React.CSSProperties {
  return {
    fontFamily: "var(--font-body), system-ui, sans-serif",
    fontSize: "var(--t-micro)",
    fontWeight: 500,
    color: "var(--color-text-on-cta)",
    background: "var(--accent)",
    border: "none",
    borderRadius: "var(--r-1)",
    padding: "0 var(--space-4)",
    minHeight: 36,
    flexShrink: 0,
    cursor: pending ? "wait" : "pointer",
    opacity: pending ? 0.5 : 1,
    transition: "opacity var(--motion-fast) var(--ease-out-quart)",
  };
}
