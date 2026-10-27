"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ExternalLink, X } from "lucide-react";
import {
  FEEDBACK,
  FEEDBACK_LABEL,
  feedbackStatus,
  FITS,
  LEVELS,
  STAGE_LABEL,
  STATUSES,
  STATUS_LABEL,
  type Feedback,
  type Fit,
  type JobRow,
  type Status,
} from "@/lib/jobs/jobs";
import { FEEDBACK_TONE, FIT_TONE, STAGE_TONE, STATUS_TONE } from "@/lib/jobs/table";
import { Pill, PillSelect } from "@/components/jobs/PillSelect";

export const STATUS_OPTIONS = STATUSES.map((s) => ({
  value: s,
  label: STATUS_LABEL[s],
  tone: STATUS_TONE[s],
}));
export const FIT_OPTIONS = FITS.map((f) => ({
  value: f,
  label: f[0].toUpperCase() + f.slice(1),
  tone: FIT_TONE[f],
}));
export const FEEDBACK_OPTIONS = FEEDBACK.map((f) => ({
  value: f,
  label: FEEDBACK_LABEL[f],
  tone: FEEDBACK_TONE[f],
}));

/** The editable text properties, in the order the peek lists them. */
const TEXT_FIELDS = [
  ["company", "Company", "text"],
  ["level", "Level", "text"],
  ["date_applied", "Applied", "date"],
  ["date_rejected", "Rejected", "date"],
  ["base_range", "Base range", "text"],
  ["total_comp_est", "Total comp", "text"],
  ["req_id", "Req ID", "text"],
  ["location", "Location", "text"],
  ["url", "Posting URL", "url"],
] as const;
type TextKey = (typeof TEXT_FIELDS)[number][0] | "title" | "notes";
type Form = Record<TextKey, string> & { status: Status | null; fit: Fit | null };

function toForm(j: Partial<JobRow>): Form {
  const s = (v: string | null | undefined) => v ?? "";
  return {
    title: s(j.title),
    company: s(j.company),
    level: s(j.level),
    date_applied: s(j.date_applied),
    date_rejected: s(j.date_rejected),
    base_range: s(j.base_range),
    total_comp_est: s(j.total_comp_est),
    req_id: s(j.req_id),
    location: s(j.location),
    url: s(j.url),
    notes: s(j.notes),
    status: j.status ?? null,
    fit: j.fit ?? null,
  };
}

/** Changed fields only; blank text goes as null so the column is cleared. */
function diff(a: Form, b: Form): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(b) as (keyof Form)[])
    if (a[k] !== b[k]) out[k] = b[k] === "" ? null : b[k];
  return out;
}

export type PeekTarget = { kind: "job"; job: JobRow } | { kind: "new" } | null;

/**
 * Notion's "side peek" for one role: a right-hand panel (full-screen on a phone) with every
 * property editable in place and the full notes. Edits save when a field loses focus, when a
 * pill changes, and when the peek closes (Esc, the scrim, or ×) — each save is one PATCH of just
 * the changed fields. "New" is the same panel, saved with POST by Create.
 */
export function JobPeek(props: {
  target: PeekTarget;
  onClose: () => void;
  onSaved: (job: JobRow) => void;
}) {
  // Keyed by the role, so opening another role (or New) starts from fresh state, while refreshed
  // data for the open role does not clobber what is being typed.
  const t = props.target;
  return <PeekPanel key={t?.kind === "job" ? t.job.id : (t?.kind ?? "")} {...props} />;
}

function PeekPanel({
  target,
  onClose,
  onSaved,
}: {
  target: PeekTarget;
  onClose: () => void;
  onSaved: (job: JobRow) => void;
}) {
  const job = target?.kind === "job" ? target.job : null;
  const isNew = target?.kind === "new";
  const [form, setForm] = useState<Form>(() =>
    toForm(isNew ? { status: "to_apply" } : (job ?? {})),
  );
  // What the server last confirmed; each save sends only the difference from it.
  const [base, setBase] = useState<Form>(form);
  const [note, setNote] = useState(job?.feedback_note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(url: string, method: "PATCH" | "POST", body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      onSaved(data.job as JobRow);
      return data.job as JobRow;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function flush(next: Form = form) {
    if (!job) return;
    const changes = diff(base, next);
    if (!Object.keys(changes).length) return;
    const prev = base;
    setBase(next);
    const out = await send(`/api/jobs/${job.id}`, "PATCH", changes);
    if (!out) return setBase(prev);
    // Pick up server-side stamps (applied/rejected dates) without losing other in-flight edits.
    const fresh = toForm(out);
    setBase(fresh);
    setForm((f) => ({
      ...f,
      date_applied: fresh.date_applied,
      date_rejected: fresh.date_rejected,
    }));
  }

  async function saveFeedback(fb: Feedback | null, n: string) {
    if (!job) return;
    if (fb === job.feedback && (n.trim() || null) === (job.feedback_note ?? null)) return;
    await send(`/api/jobs/${job.id}`, "PATCH", { feedback: fb, note: n });
  }

  async function create() {
    const body = diff(toForm({}), form);
    const out = await send("/api/jobs", "POST", body);
    if (out) onClose();
  }

  function close() {
    if (job) {
      void flush();
      if (job.feedback) void saveFeedback(job.feedback, note);
    }
    onClose();
  }

  const set = (k: TextKey) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  function pick<K extends "status" | "fit">(k: K, v: Form[K]) {
    const next = { ...form, [k]: v };
    setForm(next);
    void flush(next);
  }
  const scout = job && job.source === "job_scout";
  const fbStatus = job ? feedbackStatus(job) : null;

  return (
    <Dialog.Root open={!!target} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="jobs-peek-scrim" />
        <Dialog.Content
          className="jobs-peek"
          aria-describedby={undefined}
          onEscapeKeyDown={(e) => {
            // Escape inside an open pill menu closes only the menu.
            if ((document.activeElement as HTMLElement | null)?.closest(".jobs-pill-menu"))
              e.preventDefault();
          }}
        >
          <div className="jobs-peek-head">
            <Dialog.Title className="jobs-faint" style={{ fontSize: "var(--t-micro)", flex: 1 }}>
              {isNew ? "New role" : job?.status ? "Tracker" : "Filtered by Job Scout"}
            </Dialog.Title>
            {busy && (
              <span className="jobs-faint" style={{ fontSize: "var(--t-micro)" }}>
                Saving…
              </span>
            )}
            <Dialog.Close
              aria-label="Close"
              className="jobs-link"
              style={{ width: 40, height: 40 }}
            >
              <X size={18} aria-hidden />
            </Dialog.Close>
          </div>
          <div className="jobs-peek-body">
            <textarea
              aria-label="Role"
              placeholder="Role title"
              className="jobs-peek-title"
              rows={1}
              value={form.title}
              onChange={set("title")}
              onBlur={() => void flush()}
            />
            <div className="jobs-props">
              <span data-label>Status</span>
              <div>
                <PillSelect
                  label="Status"
                  value={form.status}
                  options={STATUS_OPTIONS}
                  onChange={(v) => pick("status", v)}
                  emptyLabel={job && !job.status ? "Not in tracker" : "Empty"}
                  clearLabel={isNew ? undefined : "Remove from tracker"}
                />
              </div>
              <span data-label>Fit</span>
              <div>
                <PillSelect
                  label="Fit"
                  value={form.fit}
                  options={FIT_OPTIONS}
                  onChange={(v) => pick("fit", v)}
                  clearLabel="Clear"
                />
              </div>
              {TEXT_FIELDS.map(([k, l, type]) => (
                <PropInput
                  key={k}
                  id={`peek-${k}`}
                  label={l}
                  type={type}
                  value={form[k]}
                  onChange={set(k)}
                  onBlur={() => void flush()}
                  list={k === "level" ? "peek-levels" : undefined}
                />
              ))}
              {scout && (
                <>
                  <span data-label>Job Scout</span>
                  <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                    {job.stage && (
                      <Pill label={STAGE_LABEL[job.stage]} tone={STAGE_TONE[job.stage]} />
                    )}
                    {job.score != null && <span>{job.score}/10</span>}
                    {job.first_seen && <span className="jobs-faint">seen {job.first_seen}</span>}
                  </div>
                </>
              )}
            </div>
            <datalist id="peek-levels">
              {LEVELS.map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>

            {form.url && /^https?:/i.test(form.url) && (
              <div style={{ margin: "var(--space-2) 0", fontSize: "var(--t-micro)" }}>
                <a href={form.url} target="_blank" rel="noreferrer" style={linkStyle}>
                  Open posting <ExternalLink size={12} aria-hidden />
                </a>
              </div>
            )}

            {job?.reason && (
              <Section
                title={
                  job.stage === "recommended"
                    ? "Why Job Scout recommended it"
                    : "Why it was filtered"
                }
              >
                <p style={{ margin: 0, whiteSpace: "pre-line" }}>{job.reason}</p>
              </Section>
            )}

            {scout && (
              <Section title="Feedback for Job Scout">
                <PillSelect
                  label="Feedback"
                  value={job.feedback}
                  options={FEEDBACK_OPTIONS}
                  onChange={(v) => void saveFeedback(v, v ? note : "")}
                  clearLabel="Clear feedback"
                />
                {job.feedback && (
                  <textarea
                    aria-label="Note for the agent"
                    placeholder="Why? (optional, read by the agent)"
                    className="jobs-notes"
                    style={{ minHeight: "4.5rem", marginTop: "var(--space-2)" }}
                    maxLength={1000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onBlur={() => void saveFeedback(job.feedback, note)}
                  />
                )}
                {fbStatus && (
                  <p className="jobs-faint" style={{ margin: "var(--space-1) 0 0" }}>
                    {fbStatus}
                  </p>
                )}
              </Section>
            )}

            <Section title="Notes">
              <textarea
                aria-label="Notes"
                className="jobs-notes"
                value={form.notes}
                onChange={set("notes")}
                onBlur={() => void flush()}
              />
            </Section>

            {error && (
              <p role="alert" style={{ color: "var(--color-danger)", fontSize: "var(--t-micro)" }}>
                {error}
              </p>
            )}
            {isNew && (
              <button
                type="button"
                className="jobs-btn"
                data-primary=""
                disabled={busy || !form.title.trim() || !form.company.trim()}
                onClick={() => void create()}
                style={{ marginTop: "var(--space-3)" }}
              >
                Create
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PropInput({
  id,
  label,
  type,
  value,
  onChange,
  onBlur,
  list,
}: {
  id: string;
  label: string;
  type: "text" | "date" | "url";
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  onBlur: () => void;
  list?: string;
}) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        className="jobs-prop-input"
        placeholder="Empty"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        list={list}
      />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: "var(--space-4)", fontSize: "var(--t-micro)" }}>
      <h3
        className="jobs-faint"
        style={{ fontSize: "var(--t-micro)", fontWeight: 600, margin: "0 0 var(--space-1)" }}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

const linkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  minHeight: 40,
  whiteSpace: "nowrap",
};
