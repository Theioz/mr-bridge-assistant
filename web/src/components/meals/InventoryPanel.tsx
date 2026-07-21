"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The kitchen inventory: raw ingredients on hand, by location.
 *
 * The fridge-leftovers panel (KitchenPanel) only knows about food already COOKED. It was blind
 * to the raw salmon and the frozen steak, which is why planning had to be TOLD what was on hand
 * every week. This panel closes that gap: fridge / freezer / pantry, soonest-to-expire first,
 * with a "use soon" flag so nothing quietly turns. Moving an item to the freezer is one tap —
 * that is how "I froze it" gets recorded, and how the planner learns the steak is next-week food.
 *
 * No macros here by design — an inventory item is a location and a rough quantity, not a
 * nutrition record.
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

function daysUntil(dateStr: string): number {
  const then = new Date(`${dateStr}T00:00:00`);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((then.getTime() - now.getTime()) / 86_400_000);
}

// Fresh window as a short badge. Danger colour when it's within two days or already past —
// those are the items the next cook should spend first.
function expiryLabel(dateStr: string | null): { text: string; urgent: boolean } | null {
  if (!dateStr) return null;
  const d = daysUntil(dateStr);
  if (d < 0) return { text: "expired", urgent: true };
  if (d === 0) return { text: "use today", urgent: true };
  if (d <= 2) return { text: `use in ${d}d`, urgent: true };
  return { text: `${d}d left`, urgent: false };
}

function quantityLabel(item: InventoryItem): string {
  if (item.quantity == null) return item.unit ?? "on hand";
  const qty = String(Number(item.quantity));
  return item.unit ? `${qty} ${item.unit}` : qty;
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

      {byLocation.length === 0 && (
        <p
          style={{
            fontSize: "var(--t-body)",
            color: "var(--color-text-muted)",
            marginBottom: "var(--space-4)",
          }}
        >
          Nothing tracked yet.
        </p>
      )}

      {byLocation.map(({ loc, rows }) => (
        <div key={loc} style={{ marginBottom: "var(--space-5)" }}>
          <p style={labelStyle}>{LOCATION_LABEL[loc]}</p>
          {rows.map((item) => {
            const editing = editingId === item.id;
            const exp = expiryLabel(item.expires_on);
            if (editing) {
              return (
                <div key={item.id} style={editRowStyle}>
                  <FormFields form={editForm} setForm={setEditForm} />
                  <div style={{ display: "flex", gap: "var(--space-2)" }}>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => saveEdit(item.id)}
                      style={eatButtonStyle(busyId === item.id)}
                    >
                      {busyId === item.id ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => setEditingId(null)}
                      style={skipButtonStyle(busyId === item.id)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div key={item.id} style={rowStyle}>
                <div style={{ minWidth: 0 }}>
                  <span style={nameStyle}>{item.name}</span>
                  <span style={subStyle}>
                    {quantityLabel(item)}
                    {item.category ? ` · ${item.category}` : ""}
                    {exp ? " · " : ""}
                    {exp && (
                      <span style={{ color: exp.urgent ? "var(--color-danger)" : undefined }}>
                        {exp.text}
                      </span>
                    )}
                  </span>
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
                    style={skipButtonStyle(busyId === item.id)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => remove(item.id)}
                    style={skipButtonStyle(busyId === item.id)}
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

      {adding ? (
        <div style={editRowStyle}>
          <FormFields form={addForm} setForm={setAddForm} />
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button
              type="button"
              disabled={busyId === "__add__"}
              onClick={addItem}
              style={eatButtonStyle(busyId === "__add__")}
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
              style={skipButtonStyle(busyId === "__add__")}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={addTriggerStyle}>
          + Add item
        </button>
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
  marginBottom: "var(--space-2)",
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

function skipButtonStyle(pending: boolean): React.CSSProperties {
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

function eatButtonStyle(pending: boolean): React.CSSProperties {
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
