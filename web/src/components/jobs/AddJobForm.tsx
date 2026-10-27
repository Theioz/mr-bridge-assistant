"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FITS, LEVELS, STATUSES, STATUS_LABEL } from "@/lib/jobs/jobs";
import { btnStyle, gridStyle, inputStyle, labelStyle, panelStyle } from "@/components/jobs/styles";

const EMPTY = {
  company: "",
  title: "",
  url: "",
  status: "to_apply",
  fit: "",
  level: "",
  notes: "",
};

/** Add a role Job Scout did not find (a referral, LinkedIn, a recruiter) straight into the tracker. */
export function AddJobForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, fit: form.fit || null, url: form.url || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Add failed");
      setForm(EMPTY);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} style={btnStyle}>
        Add a role
      </button>
    );

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <form onSubmit={submit} style={{ ...panelStyle, margin: "var(--space-2) 0" }}>
      <div style={{ ...gridStyle, margin: 0 }}>
        <label style={labelStyle}>
          Company
          <input required value={form.company} onChange={set("company")} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Role
          <input required value={form.title} onChange={set("title")} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Posting URL
          <input type="url" value={form.url} onChange={set("url")} style={inputStyle} />
        </label>
        <label style={labelStyle}>
          Status
          <select value={form.status} onChange={set("status")} style={inputStyle}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Fit
          <select value={form.fit} onChange={set("fit")} style={inputStyle}>
            <option value="">—</option>
            {FITS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Level
          <input
            list="job-levels-add"
            value={form.level}
            onChange={set("level")}
            style={inputStyle}
          />
          <datalist id="job-levels-add">
            {LEVELS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </label>
      </div>
      <label style={{ ...labelStyle, marginTop: "var(--space-2)" }}>
        Notes
        <textarea
          value={form.notes}
          onChange={set("notes")}
          rows={3}
          style={{ ...inputStyle, padding: "var(--space-2)" }}
        />
      </label>
      <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-2)" }}>
        <button type="submit" disabled={busy} style={btnStyle}>
          Add
        </button>
        <button type="button" onClick={() => setOpen(false)} style={btnStyle}>
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" style={{ fontSize: "var(--t-micro)", color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
    </form>
  );
}
