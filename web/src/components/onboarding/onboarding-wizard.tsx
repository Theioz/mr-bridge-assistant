"use client";

import { useState, useTransition } from "react";
import { WatchlistSettings } from "@/components/settings/watchlist-settings";
import { SportsSettings } from "@/components/settings/sports-settings";
import type { SportsFavorite } from "@/lib/sync/sports";

const TOTAL_STEPS = 7;

interface Props {
  initialName: string;
  initialLocation: string;
  initialFocus: string[];
  initialFitnessGoal: string;
  initialFitnessLevel: string;
  initialWorkoutPrefs: string[];
  initialEquipment: string[];
  initialCalorieTarget: string;
  initialProteinTarget: string;
  initialWatchlist: string[];
  initialSportsFavorites: SportsFavorite[];
  saveNameAndLocationAction: (name: string, city: string) => Promise<void>;
  saveFocusAction: (focus: string[]) => Promise<void>;
  saveFitnessGoalsAction: (goal: string, level: string) => Promise<void>;
  saveWorkoutPreferencesAction: (prefs: string[], equip: string[]) => Promise<void>;
  saveNutritionTargetsAction: (calories: string, proteinG: string) => Promise<void>;
  saveWatchlistAction: (tickers: string[]) => Promise<void>;
  saveSportsFavoritesAction: (favorites: SportsFavorite[]) => Promise<void>;
  completeAction: () => Promise<void>;
}

const FOCUS_OPTIONS = [
  {
    id: "productivity",
    label: "Productivity & Habits",
    description: "Tasks, habits, daily planning",
  },
  { id: "fitness", label: "Fitness & Nutrition", description: "Workouts, meals, recovery" },
  { id: "markets", label: "Markets & Investments", description: "Stock watchlist, financial news" },
  { id: "sports", label: "Sports", description: "Teams, scores, game tracking" },
];

const FITNESS_GOALS = [
  { id: "build_muscle", label: "Build muscle" },
  { id: "lose_weight", label: "Lose weight" },
  { id: "improve_endurance", label: "Improve endurance" },
  { id: "athletic_performance", label: "Athletic performance" },
  { id: "general_fitness", label: "General fitness" },
];

const FITNESS_LEVELS = [
  { id: "beginner", label: "Beginner", description: "< 1 year" },
  { id: "intermediate", label: "Intermediate", description: "1–3 years" },
  { id: "advanced", label: "Advanced", description: "3+ years" },
];

const WORKOUT_TYPES = [
  { id: "strength", label: "Strength training" },
  { id: "cardio", label: "Cardio" },
  { id: "hiit", label: "HIIT" },
  { id: "calisthenics", label: "Calisthenics" },
  { id: "yoga", label: "Yoga & Flexibility" },
  { id: "mixed", label: "Mixed" },
];

const EQUIPMENT_OPTIONS = [
  { id: "barbells", label: "Barbells & free weights" },
  { id: "cables", label: "Cables & machines" },
  { id: "bands", label: "Resistance bands" },
  { id: "pullup_bar", label: "Pull-up bar" },
  { id: "cardio_machines", label: "Cardio machines" },
  { id: "bodyweight", label: "Bodyweight only" },
];

const INTEGRATION_CARDS = [
  {
    id: "google",
    label: "Google Calendar & Gmail",
    description: "Daily schedule, meetings, and important emails in your briefing.",
  },
  {
    id: "oura",
    label: "Oura Ring",
    description: "Sleep, recovery, and readiness scores.",
  },
  {
    id: "fitbit",
    label: "Fitbit",
    description: "Workouts, body composition, and activity data.",
  },
];

const inputStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--rule)",
  borderRadius: "var(--r-1)",
  color: "var(--color-text)",
  fontSize: "var(--t-body)",
  padding: "0 var(--space-3)",
  minHeight: 44,
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--t-micro)",
  fontWeight: 500,
  color: "var(--color-text)",
  letterSpacing: "0.02em",
  marginBottom: "var(--space-2)",
};

function OptionChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 44,
        padding: "var(--space-2) var(--space-4)",
        borderRadius: "var(--r-1)",
        border: selected ? "1px solid var(--accent)" : "1px solid var(--rule)",
        background: selected ? "var(--accent)" : "transparent",
        color: selected ? "var(--color-text-on-cta)" : "var(--color-text)",
        fontSize: "var(--t-meta)",
        fontWeight: 500,
        cursor: "pointer",
        textAlign: "left",
        transition:
          "background var(--motion-fast) var(--ease-out-quart), border-color var(--motion-fast) var(--ease-out-quart)",
      }}
    >
      {children}
    </button>
  );
}

function NavButtons({
  onSkip,
  onContinue,
  continueLabel = "Continue",
  isPending,
  continueDisabled,
}: {
  onSkip: () => void;
  onContinue: () => void;
  continueLabel?: string;
  isPending: boolean;
  continueDisabled?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "var(--space-3)",
        marginTop: "var(--space-6)",
        justifyContent: "flex-end",
      }}
    >
      <button
        type="button"
        onClick={onSkip}
        disabled={isPending}
        style={{
          minHeight: 44,
          padding: "0 var(--space-5)",
          borderRadius: "var(--r-1)",
          border: "1px solid var(--rule)",
          background: "transparent",
          color: "var(--color-text-muted)",
          fontSize: "var(--t-meta)",
          cursor: "pointer",
          opacity: isPending ? 0.4 : 1,
        }}
      >
        Skip
      </button>
      <button
        type="button"
        onClick={onContinue}
        disabled={isPending || continueDisabled}
        style={{
          minHeight: 44,
          padding: "0 var(--space-5)",
          borderRadius: "var(--r-1)",
          border: "1px solid var(--accent)",
          background: "var(--accent)",
          color: "var(--color-text-on-cta)",
          fontSize: "var(--t-meta)",
          fontWeight: 500,
          cursor: "pointer",
          opacity: isPending || continueDisabled ? 0.4 : 1,
        }}
      >
        {isPending ? "Saving…" : continueLabel}
      </button>
    </div>
  );
}

export function OnboardingWizard({
  initialName,
  initialLocation,
  initialFocus,
  initialFitnessGoal,
  initialFitnessLevel,
  initialWorkoutPrefs,
  initialEquipment,
  initialCalorieTarget,
  initialProteinTarget,
  initialWatchlist,
  initialSportsFavorites,
  saveNameAndLocationAction,
  saveFocusAction,
  saveFitnessGoalsAction,
  saveWorkoutPreferencesAction,
  saveNutritionTargetsAction,
  saveWatchlistAction,
  saveSportsFavoritesAction,
  completeAction,
}: Props) {
  const [step, setStep] = useState(0);
  const [isPending, startTransition] = useTransition();

  // Step 1 state
  const [name, setName] = useState(initialName);
  const [location, setLocation] = useState(initialLocation);

  // Step 2 state
  const [focus, setFocus] = useState<string[]>(initialFocus);

  // Step 3 state
  const [fitnessGoal, setFitnessGoal] = useState(initialFitnessGoal);
  const [fitnessLevel, setFitnessLevel] = useState(initialFitnessLevel);

  // Step 4 state
  const [workoutPrefs, setWorkoutPrefs] = useState<string[]>(initialWorkoutPrefs);
  const [equipment, setEquipment] = useState<string[]>(initialEquipment);

  // Step 5 state
  const [calorieTarget, setCalorieTarget] = useState(initialCalorieTarget);
  const [proteinTarget, setProteinTarget] = useState(initialProteinTarget);

  function advance() {
    setStep((s) => s + 1);
  }

  function toggleArray(arr: string[], id: string): string[] {
    return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
  }

  // Step 1: You
  function handleNameLocationContinue() {
    startTransition(async () => {
      await saveNameAndLocationAction(name.trim(), location.trim());
      advance();
    });
  }

  // Step 2: Focus
  function handleFocusContinue() {
    startTransition(async () => {
      if (focus.length > 0) await saveFocusAction(focus);
      advance();
    });
  }

  // Step 3: Fitness goals
  function handleFitnessGoalsContinue() {
    startTransition(async () => {
      if (fitnessGoal || fitnessLevel) await saveFitnessGoalsAction(fitnessGoal, fitnessLevel);
      advance();
    });
  }

  // Step 4: Workout setup
  function handleWorkoutContinue() {
    startTransition(async () => {
      if (workoutPrefs.length > 0 || equipment.length > 0)
        await saveWorkoutPreferencesAction(workoutPrefs, equipment);
      advance();
    });
  }

  // Step 5: Nutrition
  function handleNutritionContinue() {
    startTransition(async () => {
      if (calorieTarget.trim() || proteinTarget.trim())
        await saveNutritionTargetsAction(calorieTarget.trim(), proteinTarget.trim());
      advance();
    });
  }

  // Step 6: Watchlist & Sports — saved live by embedded components, just advance
  // Step 7: Integrations — complete
  function handleComplete() {
    startTransition(async () => {
      await completeAction();
    });
  }

  const stepHeadingId = `onboarding-step-${step}`;

  return (
    <div>
      {/* Progress */}
      <p
        style={{
          fontSize: "var(--t-micro)",
          color: "var(--color-text-muted)",
          marginBottom: "var(--space-5)",
          letterSpacing: "0.04em",
        }}
      >
        Step {step + 1} of {TOTAL_STEPS}
      </p>

      {/* Step 1: You */}
      {step === 0 && (
        <section aria-labelledby={stepHeadingId}>
          <h2
            id={stepHeadingId}
            className="db-section-label"
            style={{ marginBottom: "var(--space-5)" }}
          >
            About you
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <div>
              <label htmlFor="onboarding-name" style={labelStyle}>
                What should Mr. Bridge call you?
              </label>
              <input
                id="onboarding-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="focus:outline-none input-focus-ring"
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="onboarding-location" style={labelStyle}>
                Your city (for weather)
              </label>
              <input
                id="onboarding-location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. New York"
                className="focus:outline-none input-focus-ring"
                style={inputStyle}
              />
            </div>
          </div>
          <NavButtons
            onSkip={advance}
            onContinue={handleNameLocationContinue}
            isPending={isPending}
          />
        </section>
      )}

      {/* Step 2: Focus */}
      {step === 1 && (
        <section aria-labelledby={stepHeadingId}>
          <h2
            id={stepHeadingId}
            className="db-section-label"
            style={{ marginBottom: "var(--space-2)" }}
          >
            What brings you to Mr. Bridge?
          </h2>
          <p
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-text-muted)",
              marginBottom: "var(--space-5)",
            }}
          >
            Select all that apply. This helps Mr. Bridge prioritize your daily briefing.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {FOCUS_OPTIONS.map((opt) => (
              <OptionChip
                key={opt.id}
                selected={focus.includes(opt.id)}
                onClick={() => setFocus((f) => toggleArray(f, opt.id))}
              >
                <span style={{ fontWeight: 600 }}>{opt.label}</span>
                <span
                  style={{
                    display: "block",
                    fontSize: "var(--t-micro)",
                    fontWeight: 400,
                    opacity: 0.8,
                    marginTop: 2,
                  }}
                >
                  {opt.description}
                </span>
              </OptionChip>
            ))}
          </div>
          <NavButtons onSkip={advance} onContinue={handleFocusContinue} isPending={isPending} />
        </section>
      )}

      {/* Step 3: Fitness goals */}
      {step === 2 && (
        <section aria-labelledby={stepHeadingId}>
          <h2
            id={stepHeadingId}
            className="db-section-label"
            style={{ marginBottom: "var(--space-5)" }}
          >
            Fitness goals
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div>
              <p style={{ ...labelStyle, marginBottom: "var(--space-3)" }}>Primary goal</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {FITNESS_GOALS.map((g) => (
                  <OptionChip
                    key={g.id}
                    selected={fitnessGoal === g.id}
                    onClick={() => setFitnessGoal((prev) => (prev === g.id ? "" : g.id))}
                  >
                    {g.label}
                  </OptionChip>
                ))}
              </div>
            </div>
            <div>
              <p style={{ ...labelStyle, marginBottom: "var(--space-3)" }}>Current fitness level</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {FITNESS_LEVELS.map((l) => (
                  <OptionChip
                    key={l.id}
                    selected={fitnessLevel === l.id}
                    onClick={() => setFitnessLevel((prev) => (prev === l.id ? "" : l.id))}
                  >
                    <span style={{ fontWeight: 600 }}>{l.label}</span>
                    <span
                      style={{
                        display: "block",
                        fontSize: "var(--t-micro)",
                        fontWeight: 400,
                        opacity: 0.8,
                        marginTop: 2,
                      }}
                    >
                      {l.description}
                    </span>
                  </OptionChip>
                ))}
              </div>
            </div>
          </div>
          <NavButtons
            onSkip={advance}
            onContinue={handleFitnessGoalsContinue}
            isPending={isPending}
          />
        </section>
      )}

      {/* Step 4: Workout setup */}
      {step === 3 && (
        <section aria-labelledby={stepHeadingId}>
          <h2
            id={stepHeadingId}
            className="db-section-label"
            style={{ marginBottom: "var(--space-5)" }}
          >
            Workout preferences
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>
            <div>
              <p style={{ ...labelStyle, marginBottom: "var(--space-3)" }}>
                Types of workouts you do (select all that apply)
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {WORKOUT_TYPES.map((w) => (
                  <OptionChip
                    key={w.id}
                    selected={workoutPrefs.includes(w.id)}
                    onClick={() => setWorkoutPrefs((p) => toggleArray(p, w.id))}
                  >
                    {w.label}
                  </OptionChip>
                ))}
              </div>
            </div>
            <div>
              <p style={{ ...labelStyle, marginBottom: "var(--space-3)" }}>
                Equipment you have access to
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                {EQUIPMENT_OPTIONS.map((e) => (
                  <OptionChip
                    key={e.id}
                    selected={equipment.includes(e.id)}
                    onClick={() => setEquipment((p) => toggleArray(p, e.id))}
                  >
                    {e.label}
                  </OptionChip>
                ))}
              </div>
            </div>
          </div>
          <NavButtons onSkip={advance} onContinue={handleWorkoutContinue} isPending={isPending} />
        </section>
      )}

      {/* Step 5: Nutrition targets */}
      {step === 4 && (
        <section aria-labelledby={stepHeadingId}>
          <h2
            id={stepHeadingId}
            className="db-section-label"
            style={{ marginBottom: "var(--space-2)" }}
          >
            Nutrition targets
          </h2>
          <p
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-text-muted)",
              marginBottom: "var(--space-5)",
            }}
          >
            Leave blank to let Mr. Bridge estimate targets based on your fitness goal.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
            <div>
              <label htmlFor="onboarding-calories" style={labelStyle}>
                Daily calorie target
              </label>
              <input
                id="onboarding-calories"
                type="number"
                value={calorieTarget}
                onChange={(e) => setCalorieTarget(e.target.value)}
                placeholder="e.g. 2200"
                min={0}
                className="focus:outline-none input-focus-ring"
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="onboarding-protein" style={labelStyle}>
                Daily protein target (g)
              </label>
              <input
                id="onboarding-protein"
                type="number"
                value={proteinTarget}
                onChange={(e) => setProteinTarget(e.target.value)}
                placeholder="e.g. 160"
                min={0}
                className="focus:outline-none input-focus-ring"
                style={inputStyle}
              />
            </div>
          </div>
          <NavButtons onSkip={advance} onContinue={handleNutritionContinue} isPending={isPending} />
        </section>
      )}

      {/* Step 6: Watchlist & Sports */}
      {step === 5 && (
        <section aria-labelledby={stepHeadingId}>
          <h2
            id={stepHeadingId}
            className="db-section-label"
            style={{ marginBottom: "var(--space-5)" }}
          >
            Watchlist &amp; sports
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-7)" }}>
            <div>
              <p style={{ ...labelStyle, marginBottom: "var(--space-3)" }}>Stock watchlist</p>
              <WatchlistSettings
                watchlist={initialWatchlist}
                saveAction={saveWatchlistAction}
                hasApiKey={true}
              />
            </div>
            <div
              style={{
                borderTop: "1px solid var(--rule-soft)",
                paddingTop: "var(--space-6)",
              }}
            >
              <p style={{ ...labelStyle, marginBottom: "var(--space-3)" }}>Sports favorites</p>
              <SportsSettings
                favorites={initialSportsFavorites}
                saveAction={saveSportsFavoritesAction}
              />
            </div>
          </div>
          <NavButtons
            onSkip={advance}
            onContinue={advance}
            continueLabel="Continue"
            isPending={false}
          />
        </section>
      )}

      {/* Step 7: Integrations */}
      {step === 6 && (
        <section aria-labelledby={stepHeadingId}>
          <h2
            id={stepHeadingId}
            className="db-section-label"
            style={{ marginBottom: "var(--space-2)" }}
          >
            Connect integrations
          </h2>
          <p
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-text-muted)",
              marginBottom: "var(--space-5)",
            }}
          >
            Connect your tools so Mr. Bridge can include them in your daily briefing. You can always
            do this later in Settings.
          </p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {INTEGRATION_CARDS.map((card, i) => (
              <div
                key={card.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--space-4)",
                  padding: "var(--space-4) 0",
                  borderBottom:
                    i < INTEGRATION_CARDS.length - 1 ? "1px solid var(--rule-soft)" : "none",
                }}
              >
                <div>
                  <p
                    style={{
                      fontSize: "var(--t-meta)",
                      fontWeight: 600,
                      color: "var(--color-text)",
                      margin: 0,
                    }}
                  >
                    {card.label}
                  </p>
                  <p
                    style={{
                      fontSize: "var(--t-micro)",
                      color: "var(--color-text-muted)",
                      margin: "2px 0 0",
                    }}
                  >
                    {card.description}
                  </p>
                </div>
                <a
                  href="/settings?tab=integrations"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    minHeight: 36,
                    padding: "0 var(--space-4)",
                    borderRadius: "var(--r-1)",
                    border: "1px solid var(--rule)",
                    background: "transparent",
                    color: "var(--color-text)",
                    fontSize: "var(--t-micro)",
                    fontWeight: 500,
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  Connect ↗
                </a>
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              gap: "var(--space-3)",
              marginTop: "var(--space-7)",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={handleComplete}
              disabled={isPending}
              style={{
                minHeight: 44,
                padding: "0 var(--space-5)",
                borderRadius: "var(--r-1)",
                border: "1px solid var(--rule)",
                background: "transparent",
                color: "var(--color-text-muted)",
                fontSize: "var(--t-meta)",
                cursor: "pointer",
                opacity: isPending ? 0.4 : 1,
              }}
            >
              Skip for now
            </button>
            <button
              type="button"
              onClick={handleComplete}
              disabled={isPending}
              style={{
                minHeight: 44,
                padding: "0 var(--space-5)",
                borderRadius: "var(--r-1)",
                border: "1px solid var(--accent)",
                background: "var(--accent)",
                color: "var(--color-text-on-cta)",
                fontSize: "var(--t-meta)",
                fontWeight: 500,
                cursor: "pointer",
                opacity: isPending ? 0.4 : 1,
              }}
            >
              {isPending ? "Finishing…" : "Finish setup"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
