"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, MessageSquare, X } from "lucide-react";
import InlineMealChat from "./InlineMealChat";
import ActionRow from "./food-photo/ActionRow";
import AddMorePhotos from "./food-photo/AddMorePhotos";
import CombinedTotal from "./food-photo/CombinedTotal";
import EmptyState from "./food-photo/EmptyState";
import ErrorPanel from "./food-photo/ErrorPanel";
import LogSheet from "./food-photo/LogSheet";
import ManualEntryForm from "./food-photo/ManualEntryForm";
import MealPrepSheet from "./food-photo/MealPrepSheet";
import ModeToggle from "./food-photo/ModeToggle";
import { FailedPhotoRow, PendingPhotoRow } from "./food-photo/PhotoStatusRows";
import ScanItemRow from "./food-photo/ScanItemRow";
import StagedQueue from "./food-photo/StagedQueue";
import { ghostStyle } from "./food-photo/styles";
import type { ActiveSheet, AnalyzerMode, MealType, ScanPhase } from "./food-photo/types";
import { useManualEntry } from "./food-photo/useManualEntry";
import { usePhotoQueue } from "./food-photo/usePhotoQueue";
import { useScanItems } from "./food-photo/useScanItems";
import {
  acceptedPicks,
  buildNutritionContext,
  combineTotals,
  HEIC_MSG,
  MAX_PHOTOS,
  sumNullable,
} from "./food-photo/utils";

export type { MealType, ScanItem } from "./food-photo/types";

interface FoodPhotoAnalyzerProps {
  onUnsavedItems?: (count: number) => void;
}

export default function FoodPhotoAnalyzer({ onUnsavedItems }: FoodPhotoAnalyzerProps) {
  const router = useRouter();

  // ── Session state ─────────────────────────────────────────────────────────
  const [scanPhase, setScanPhase] = useState<ScanPhase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [analyzerMode, setAnalyzerMode] = useState<AnalyzerMode>("food");
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);

  // ── Log sheet state ───────────────────────────────────────────────────────
  const [logMealType, setLogMealType] = useState<MealType>("lunch");
  const [servings, setServings] = useState("1");
  const [logging, setLogging] = useState(false);

  // ── Meal prep sheet state ─────────────────────────────────────────────────
  const [batchServings, setBatchServings] = useState("1");
  const [containers, setContainers] = useState("1");
  const [mealPrepType, setMealPrepType] = useState<MealType>("lunch");
  const [prepping, setPrepping] = useState(false);

  // ── Inline chat state ────────────────────────────────────────────────────
  const [showInlineChat, setShowInlineChat] = useState(false);

  // ── User context (optional dish description, #371) ───────────────────────
  const [userContext, setUserContext] = useState("");

  const scan = useScanItems();
  const { items, rescanInputRef, handleRescanFileChange } = scan;
  const manual = useManualEntry();
  const queue = usePhotoQueue({
    analyzerMode,
    itemCount: items.length,
    userContext,
    addItem: scan.addItem,
    onHeicRejected: () => {
      setErrorMsg(HEIC_MSG);
      setScanPhase("error");
    },
  });
  const { pendingPhotos, failedPhotos, stagedPhotos, cameraInputRef, libraryInputRef } = queue;

  // ── Derived totals (scaled by per-item portionFraction, #545) ─────────────
  const combined = combineTotals(items);
  // Nutrient totals are null when no item reports a value, so we render "—" instead of "0".
  const combinedFiber = sumNullable(items, "fiber_g");
  const combinedSugar = sumNullable(items, "sugar_g");

  // ── Unsaved count: completed items + in-flight analyses + staged (#545, #574) ──
  useEffect(() => {
    onUnsavedItems?.(items.length + pendingPhotos.length + stagedPhotos.length);
  }, [items.length, pendingPhotos.length, stagedPhotos.length, onUnsavedItems]);

  function clearAll() {
    scan.clearItems();
    queue.clear();
    setActiveSheet(null);
  }

  // ── Manual entry ──────────────────────────────────────────────────────────
  function handleAddManual() {
    if (!manual.label.trim()) return;
    scan.addItem({
      id: crypto.randomUUID(),
      mode: "food",
      label: manual.label.trim(),
      calories: parseFloat(manual.cal) || 0,
      protein_g: parseFloat(manual.protein) || 0,
      carbs_g: parseFloat(manual.carbs) || 0,
      fat_g: parseFloat(manual.fat) || 0,
      fiber_g: null,
      sugar_g: null,
      portionFraction: 1,
    });
    manual.reset();
    setScanPhase("idle");
  }

  // ── Log as meal ───────────────────────────────────────────────────────────
  async function handleLogMeal() {
    const s = parseFloat(servings) || 1;
    const logUserContext = items.find((i) => i.user_context)?.user_context;
    setLogging(true);
    try {
      const res = await fetch("/api/meals/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meal_type: logMealType,
          notes: items.map((i) => i.label).join(", "),
          user_context: logUserContext ?? undefined,
          calories: Math.round(combined.calories * s),
          protein_g: Math.round(combined.protein_g * s * 10) / 10,
          carbs_g: Math.round(combined.carbs_g * s * 10) / 10,
          fat_g: Math.round(combined.fat_g * s * 10) / 10,
          fiber_g: combinedFiber === null ? null : Math.round(combinedFiber * s * 10) / 10,
          sugar_g: combinedSugar === null ? null : Math.round(combinedSugar * s * 10) / 10,
          source: "scanner",
          picks: acceptedPicks(items),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to log meal");
      clearAll();
      setServings("1");
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to log meal");
    } finally {
      setLogging(false);
    }
  }

  // ── Meal prep ─────────────────────────────────────────────────────────────
  async function handleMealPrep() {
    const n = parseInt(containers) || 1;
    const perContainer = {
      calories: Math.round(combined.calories / n),
      protein_g: Math.round((combined.protein_g / n) * 10) / 10,
      carbs_g: Math.round((combined.carbs_g / n) * 10) / 10,
      fat_g: Math.round((combined.fat_g / n) * 10) / 10,
      fiber_g: combinedFiber === null ? null : Math.round((combinedFiber / n) * 10) / 10,
      sugar_g: combinedSugar === null ? null : Math.round((combinedSugar / n) * 10) / 10,
    };
    const prepUserContext = items.find((i) => i.user_context)?.user_context;
    setPrepping(true);
    try {
      const res = await fetch("/api/meals/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meal_type: mealPrepType,
          notes: items.map((i) => i.label).join(", "),
          user_context: prepUserContext ?? undefined,
          ...perContainer,
          source: "scanner",
          count: n,
          picks: acceptedPicks(items),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Failed to log meal prep");
      clearAll();
      setBatchServings("1");
      setContainers("1");
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to log meal prep");
    } finally {
      setPrepping(false);
    }
  }

  const openCamera = () => cameraInputRef.current?.click();
  const openLibrary = () => libraryInputRef.current?.click();

  const photoCapReached = items.length + pendingPhotos.length + stagedPhotos.length >= MAX_PHOTOS;
  const hasPhotos = items.length > 0 || pendingPhotos.length > 0 || failedPhotos.length > 0;

  return (
    <div className="flex flex-col" style={{ gap: "var(--space-4)" }}>
      {/* Mode toggle — always visible */}
      <ModeToggle mode={analyzerMode} onChange={setAnalyzerMode} />

      {/* ── STAGED QUEUE — photos waiting for submit (#574) ──────────────── */}
      {stagedPhotos.length > 0 && (
        <StagedQueue
          photos={stagedPhotos}
          userContext={userContext}
          onUserContextChange={setUserContext}
          onRemove={queue.removeStagedPhoto}
          onSubmit={queue.submitStaged}
        />
      )}

      {/* Hidden file inputs — camera (single), library (multi-select), and per-item re-scan */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={queue.handleFileChange}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={queue.handleFilesChange}
      />
      <input
        ref={rescanInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleRescanFileChange}
      />

      {/* ── ERROR / recovery panel ───────────────────────────────────────── */}
      {scanPhase === "error" && (
        <ErrorPanel
          message={errorMsg}
          onCamera={() => {
            setScanPhase("idle");
            setErrorMsg("");
            openCamera();
          }}
          onLibrary={() => {
            setScanPhase("idle");
            setErrorMsg("");
            openLibrary();
          }}
          onManual={() => {
            setErrorMsg("");
            setScanPhase("manual");
          }}
        />
      )}

      {/* ── MANUAL ENTRY form ────────────────────────────────────────────── */}
      {scanPhase === "manual" && (
        <ManualEntryForm
          manual={manual}
          onAdd={handleAddManual}
          onCancel={() => setScanPhase("idle")}
        />
      )}

      {/* ── EMPTY STATE — dashed upload zone ─────────────────────────────── */}
      {!hasPhotos && scanPhase === "idle" && (
        <EmptyState
          userContext={userContext}
          onUserContextChange={setUserContext}
          onCamera={openCamera}
          onLibrary={openLibrary}
        />
      )}

      {/* ── ITEM LIST (completed + pending + failed) ──────────────────────── */}
      {hasPhotos && (
        <div className="flex flex-col">
          {items.map((item, idx) => {
            const expanded = scan.expandedItemId === item.id;
            return (
              <ScanItemRow
                key={item.id}
                item={item}
                isFirst={idx === 0}
                expanded={expanded}
                onToggleExpanded={() => scan.setExpandedItemId(expanded ? null : item.id)}
                onRemove={() => scan.removeItem(item.id)}
                onUpdate={(patch) => scan.updateItem(item.id, patch)}
                reestimating={scan.reestimatingId === item.id}
                rescanning={scan.rescanningId === item.id}
                rescanError={scan.rescanError?.id === item.id ? scan.rescanError.msg : null}
                onReestimate={() => scan.reestimateItem(item.id, item.ingredients ?? "")}
                onRescan={() => scan.startRescan(item.id)}
              />
            );
          })}

          {pendingPhotos.map((p, idx) => (
            <PendingPhotoRow key={p.tempId} photo={p} divider={items.length > 0 || idx > 0} />
          ))}

          {failedPhotos.map((f, idx) => (
            <FailedPhotoRow
              key={f.tempId}
              photo={f}
              divider={items.length > 0 || pendingPhotos.length > 0 || idx > 0}
              onRetry={() => queue.retryFailedPhoto(f.tempId)}
              onDismiss={() => queue.dismissFailedPhoto(f.tempId)}
            />
          ))}

          {/* Add another scan — hidden when cap reached */}
          <AddMorePhotos
            showButtons={scanPhase === "idle"}
            capReached={photoCapReached}
            onCamera={openCamera}
            onLibrary={openLibrary}
          />
        </div>
      )}

      {/* ── COMBINED TOTAL + ACTIONS (only when items exist) ────────────── */}
      {items.length > 0 && (
        <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
          <CombinedTotal combined={combined} fiber={combinedFiber} sugar={combinedSugar} />

          {/* Ask Mr. Bridge */}
          {!showInlineChat ? (
            <button
              onClick={() => setShowInlineChat(true)}
              className="flex items-center transition-opacity active:opacity-70"
              style={{
                ...ghostStyle,
                gap: "var(--space-2)",
                fontSize: "var(--t-meta)",
                padding: "var(--space-3) var(--space-4)",
              }}
            >
              <MessageSquare size={14} />
              Ask Mr. Bridge…
            </button>
          ) : (
            <InlineMealChat
              initialContext={buildNutritionContext(items, combined, combinedFiber, combinedSugar)}
              scanItems={items}
              defaultMealType={logMealType}
              onLoggedViaChat={() => {
                clearAll();
                router.refresh();
              }}
              onClose={() => setShowInlineChat(false)}
            />
          )}

          {/* Sheet error */}
          {errorMsg && scanPhase === "idle" && (
            <div
              className="flex items-center"
              style={{
                gap: "var(--space-2)",
                color: "var(--color-danger)",
                fontSize: "var(--t-meta)",
              }}
            >
              <AlertCircle size={14} />
              {errorMsg}
              <button
                onClick={() => setErrorMsg("")}
                style={{
                  marginLeft: "auto",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "inherit",
                }}
              >
                <X size={13} />
              </button>
            </div>
          )}

          <ActionRow
            activeSheet={activeSheet}
            onToggleSheet={(sheet) => setActiveSheet(activeSheet === sheet ? null : sheet)}
            onClearAll={clearAll}
          />

          {/* ── LOG SHEET ──────────────────────────────────────────────── */}
          {activeSheet === "log" && (
            <LogSheet
              mealType={logMealType}
              onMealTypeChange={setLogMealType}
              servings={servings}
              onServingsChange={setServings}
              combined={combined}
              logging={logging}
              onLog={handleLogMeal}
            />
          )}

          {/* ── MEAL PREP SHEET ────────────────────────────────────────── */}
          {activeSheet === "mealprep" && (
            <MealPrepSheet
              batchServings={batchServings}
              onBatchServingsChange={setBatchServings}
              containers={containers}
              onContainersChange={setContainers}
              mealType={mealPrepType}
              onMealTypeChange={setMealPrepType}
              combined={combined}
              prepping={prepping}
              onSubmit={handleMealPrep}
            />
          )}
        </div>
      )}
    </div>
  );
}
