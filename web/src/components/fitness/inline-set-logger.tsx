"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash2, Loader2 } from "lucide-react";
import type { WeightUnit } from "@/lib/units";
import { displayToKg, kgToDisplay } from "@/lib/units";
import type { StrengthSessionSet } from "@/lib/types";

const LS_END = "bridge:rest_timer_end";
const LS_DURATION = "bridge:rest_timer_duration";
const DEFAULT_DURATION_S = 90;

function formatMMSS(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface Props {
  date: string;
  workoutPlanId: string | null;
  exerciseName: string;
  exerciseOrder: number;
  targetSets?: number;
  targetReps?: string;
  targetWeightLbs?: number | null;
  weightNotation?: "per_hand" | "total" | null;
  existingSets: StrengthSessionSet[];
  unit: WeightUnit;
  restTimerEnabled?: boolean;
}

export function InlineSetLogger({
  date,
  workoutPlanId,
  exerciseName,
  exerciseOrder,
  targetSets,
  targetReps,
  targetWeightLbs,
  weightNotation,
  existingSets,
  unit,
  restTimerEnabled = true,
}: Props) {
  const router = useRouter();
  const [weight, setWeight] = useState<string>(() => suggestWeight(targetWeightLbs, unit));
  const [reps, setReps] = useState<string>(() => suggestReps(targetReps));
  const [rpe, setRpe] = useState<string>("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Rest timer state
  const [timerEndMs, setTimerEndMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const pulseFiredRef = useRef(false);

  // On mount: resume an in-progress timer from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_END);
      if (stored) {
        const end = parseInt(stored, 10);
        if (Number.isFinite(end) && end > Date.now()) {
          setTimerEndMs(end);
        }
      }
    } catch {
      // localStorage unavailable — skip
    }
  }, []);

  // Tick every 250ms while the timer is active
  useEffect(() => {
    if (timerEndMs == null) return;
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, [timerEndMs]);

  // Fire push notification once when timer reaches zero
  useEffect(() => {
    if (timerEndMs == null || pulseFiredRef.current) return;
    if (nowMs >= timerEndMs) {
      pulseFiredRef.current = true;
      fetch("/api/notifications/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Rest done", message: "Time to log your next set." }),
      }).catch(() => {});
    }
  }, [nowMs, timerEndMs]);

  function startTimer() {
    pulseFiredRef.current = false;
    let durationSec = DEFAULT_DURATION_S;
    try {
      const stored = localStorage.getItem(LS_DURATION);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (Number.isFinite(parsed) && parsed > 0) durationSec = parsed;
      }
    } catch {
      // ignore
    }
    const end = Date.now() + durationSec * 1000;
    try {
      localStorage.setItem(LS_END, String(end));
    } catch {
      // ignore
    }
    setTimerEndMs(end);
    setNowMs(Date.now());
  }

  function dismissTimer() {
    try {
      localStorage.removeItem(LS_END);
    } catch {
      // ignore
    }
    setTimerEndMs(null);
    pulseFiredRef.current = false;
  }

  const nextSetNumber = (existingSets[existingSets.length - 1]?.set_number ?? 0) + 1;
  const totalTarget = targetSets ?? null;
  const atTarget = totalTarget != null && existingSets.length >= totalTarget;

  async function logSet() {
    setErr(null);
    const weightNum = weight.trim() === "" ? null : Number(weight);
    const repsNum = reps.trim() === "" ? null : Number(reps);
    const rpeNum = rpe.trim() === "" ? null : Number(rpe);

    if (weightNum != null && !Number.isFinite(weightNum)) {
      setErr("Weight must be a number");
      return;
    }
    if (repsNum != null && (!Number.isFinite(repsNum) || repsNum <= 0)) {
      setErr("Reps must be a positive number");
      return;
    }
    if (rpeNum != null && (rpeNum < 1 || rpeNum > 10)) {
      setErr("RPE must be 1–10");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/strength-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          performed_on: date,
          workout_plan_id: workoutPlanId,
          exercise_name: exerciseName,
          exercise_order: exerciseOrder,
          set_number: nextSetNumber,
          weight_kg: weightNum == null ? null : displayToKg(weightNum, unit),
          reps: repsNum,
          rpe: rpeNum,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setErr(j?.error ?? `Request failed: ${res.status}`);
        return;
      }
      setRpe("");
      if (restTimerEnabled) startTimer();
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setPending(false);
    }
  }

  async function removeSet(setId: string) {
    setPending(true);
    try {
      const res = await fetch(`/api/strength-sessions?set_id=${encodeURIComponent(setId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        setErr(j?.error ?? `Delete failed: ${res.status}`);
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const timerDone = timerEndMs != null && nowMs >= timerEndMs;
  const remainingMs = timerEndMs != null ? Math.max(0, timerEndMs - nowMs) : 0;

  return (
    <div style={{ marginTop: 4, marginBottom: 6 }}>
      {/* Logged sets list */}
      {existingSets.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          {existingSets.map((s) => {
            const displayWeight = kgToDisplay(s.weight_kg, unit);
            const parts: string[] = [];
            if (displayWeight != null) {
              const notation = weightNotation === "per_hand" ? " / hand" : weightNotation === "total" ? " total" : "";
              parts.push(`${displayWeight} ${unit}${notation}`);
            }
            if (s.reps != null) parts.push(`× ${s.reps}`);
            if (s.rpe != null) parts.push(`@ RPE ${s.rpe}`);
            return (
              <div
                key={s.id}
                className="flex items-center gap-2"
                style={{
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  padding: "2px 0",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span style={{ color: "var(--color-positive)" }}>
                  <Check size={10} />
                </span>
                <span style={{ minWidth: 32 }}>Set {s.set_number}</span>
                <span>{parts.length > 0 ? parts.join(" ") : "—"}</span>
                <button
                  onClick={() => removeSet(s.id)}
                  disabled={pending}
                  className="ml-auto hover-text-danger cursor-pointer print:hidden"
                  style={{ color: "var(--color-text-faint)", background: "transparent", border: "none" }}
                  aria-label={`Remove set ${s.set_number}`}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Input row */}
      {!atTarget && (
        <div className="flex items-center gap-1.5 print:hidden" style={{ flexWrap: "wrap" }}>
          <LoggerInput
            value={weight}
            onChange={setWeight}
            placeholder={unit}
            width={56}
            aria-label={`Weight for ${exerciseName} set ${nextSetNumber}`}
            disabled={pending}
          />
          <LoggerInput
            value={reps}
            onChange={setReps}
            placeholder="reps"
            width={52}
            aria-label={`Reps for ${exerciseName} set ${nextSetNumber}`}
            disabled={pending}
          />
          <LoggerInput
            value={rpe}
            onChange={setRpe}
            placeholder="rpe"
            width={44}
            aria-label={`RPE for ${exerciseName} set ${nextSetNumber}`}
            disabled={pending}
          />
          <button
            onClick={logSet}
            disabled={pending}
            className="cursor-pointer hover-text-brighten"
            style={{
              background: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
              color: "var(--color-text)",
              fontSize: 11,
              padding: "3px 9px",
              borderRadius: 5,
              lineHeight: 1,
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {pending ? <Loader2 size={10} className="animate-spin" /> : null}
            Log set {nextSetNumber}
            {totalTarget ? ` / ${totalTarget}` : ""}
          </button>
        </div>
      )}

      {atTarget && (
        <p
          style={{
            fontSize: 11,
            color: "var(--color-positive)",
            fontStyle: "italic",
            marginTop: 2,
          }}
        >
          Target sets logged ✓
        </p>
      )}

      {/* Rest timer widget */}
      {timerEndMs != null && (
        <div
          className={timerDone ? "rest-timer-done" : undefined}
          style={{
            marginTop: 6,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 11,
            fontVariantNumeric: "tabular-nums",
            color: timerDone ? "var(--color-positive)" : "var(--color-text-muted)",
          }}
        >
          <span>Rest · {timerDone ? "0:00" : formatMMSS(remainingMs)}</span>
          <button
            onClick={dismissTimer}
            aria-label="Dismiss rest timer"
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--color-text-faint)",
              fontSize: 11,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {err && (
        <p style={{ fontSize: 11, color: "var(--color-danger)", marginTop: 4 }}>{err}</p>
      )}
    </div>
  );
}

function LoggerInput({
  value,
  onChange,
  placeholder,
  width,
  disabled,
  ...aria
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  width: number;
  disabled?: boolean;
  "aria-label"?: string;
}) {
  return (
    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="input-focus-ring"
      style={{
        width,
        fontSize: 12,
        padding: "3px 6px",
        borderRadius: 4,
        border: "1px solid var(--color-border)",
        background: "var(--color-bg, var(--color-surface))",
        color: "var(--color-text)",
        fontVariantNumeric: "tabular-nums",
        textAlign: "center",
        outline: "none",
      }}
      {...aria}
    />
  );
}

function suggestWeight(targetLbs: number | null | undefined, unit: WeightUnit): string {
  if (targetLbs == null) return "";
  if (unit === "lb") return String(Math.round(targetLbs));
  const kg = targetLbs / 2.2046226218;
  return String(Math.round(kg * 2) / 2);
}

function suggestReps(target: string | undefined): string {
  if (!target) return "";
  const match = target.match(/(\d+)/);
  return match ? match[1] : "";
}
