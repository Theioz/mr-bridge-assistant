import { useRef, useState } from "react";
import { compressImage } from "@/lib/meal-photo";
import type { AnalyzerMode, FailedPhoto, PendingPhoto, ScanItem, StagedPhoto } from "./types";
import { isHeic, MAX_PHOTOS } from "./utils";

/**
 * Per-photo batch state (#545): staged (picked, not yet submitted, #574) → pending
 * (analysis in flight) → an item, or failed (with retry). Owns the camera and library
 * file inputs.
 */
export function usePhotoQueue({
  analyzerMode,
  itemCount,
  userContext,
  addItem,
  onHeicRejected,
}: {
  analyzerMode: AnalyzerMode;
  itemCount: number;
  userContext: string;
  addItem: (item: ScanItem) => void;
  onHeicRejected: () => void;
}) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [failedPhotos, setFailedPhotos] = useState<FailedPhoto[]>([]);
  const [stagedPhotos, setStagedPhotos] = useState<StagedPhoto[]>([]);

  function clear() {
    setPendingPhotos([]);
    setFailedPhotos([]);
    for (const p of stagedPhotos) {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    }
    setStagedPhotos([]);
  }

  // ── Per-photo analysis — called once per file, compression included (#545) ─
  async function analyzeOneFile(file: File, tempId: string, context?: string) {
    let imageBlob: Blob;
    try {
      imageBlob = await compressImage(file);
    } catch {
      if (file.size > 4 * 1024 * 1024) {
        setPendingPhotos((prev) => prev.filter((p) => p.tempId !== tempId));
        setFailedPhotos((prev) => [
          ...prev,
          {
            tempId,
            file,
            errorMsg: "Couldn't compress this photo. Try a smaller or lower-resolution image.",
          },
        ]);
        return;
      }
      imageBlob = file;
    }

    const formData = new FormData();
    formData.append("image", imageBlob, "photo.jpg");
    formData.append("mode", analyzerMode);
    const trimmedContext = context?.trim() ?? "";
    if (trimmedContext) formData.append("user_context", trimmedContext);

    try {
      const res = await fetch("/api/meals/analyze-photo", {
        method: "POST",
        body: formData,
      });
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error ?? "Analysis failed");

        if (data.mode === "label") {
          if (!data.readable) {
            setPendingPhotos((prev) => prev.filter((p) => p.tempId !== tempId));
            setFailedPhotos((prev) => [
              ...prev,
              {
                tempId,
                file,
                errorMsg: "Label wasn't clear enough to read — try a better-lit photo.",
              },
            ]);
            return;
          }
          addItem({
            id: crypto.randomUUID(),
            mode: "label",
            label: data.product_name || "Nutrition Label",
            calories: data.calories ?? 0,
            protein_g: data.protein_g ?? 0,
            carbs_g: data.carbs_g ?? 0,
            fat_g: data.fat_g ?? 0,
            fiber_g: data.fiber_g ?? null,
            sugar_g: data.sugar_g ?? null,
            sodium_mg: data.sodium_mg ?? undefined,
            user_context: trimmedContext || undefined,
            portionFraction: 1,
          });
        } else {
          addItem({
            id: crypto.randomUUID(),
            mode: "food",
            label: data.food_name ?? "Unknown food",
            calories: data.calories ?? 0,
            protein_g: data.protein_g ?? 0,
            carbs_g: data.carbs_g ?? 0,
            fat_g: data.fat_g ?? 0,
            fiber_g: data.fiber_g ?? null,
            sugar_g: data.sugar_g ?? null,
            sodium_mg: data.sodium_mg ?? undefined,
            ingredients: data.ingredients ?? undefined,
            user_context: trimmedContext || undefined,
            portionFraction: 1,
            picks: Array.isArray(data.items)
              ? data.items
                  .filter((it: { query?: string; fdcId?: number }) => it?.query && it?.fdcId)
                  .map((it: { query: string; fdcId: number; matched?: string }) => ({
                    query: it.query,
                    fdc_id: it.fdcId,
                    description: it.matched,
                  }))
              : undefined,
          });
        }
        setPendingPhotos((prev) => prev.filter((p) => p.tempId !== tempId));
      } else {
        const text = await res.text();
        if (res.status === 413 || text.includes("Entity Too Large")) {
          throw new Error("Image is too large to upload. Please try a smaller photo.");
        }
        throw new Error("Analysis failed");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Analysis failed";
      setPendingPhotos((prev) => prev.filter((p) => p.tempId !== tempId));
      setFailedPhotos((prev) => [...prev, { tempId, file, errorMsg: msg }]);
    }
  }

  // ── Camera capture — single file at a time, up to 6 total (#545) ─────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (libraryInputRef.current) libraryInputRef.current.value = "";

    if (itemCount + pendingPhotos.length + stagedPhotos.length >= MAX_PHOTOS) return;

    if (isHeic(file)) {
      onHeicRejected();
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    const tempId = crypto.randomUUID();
    setStagedPhotos((prev) => [...prev, { tempId, file, fileName: file.name, previewUrl }]);
  }

  // ── Library multi-select — up to 6 photos at once (#545) ─────────────────
  function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const remaining = MAX_PHOTOS - itemCount - pendingPhotos.length - stagedPhotos.length;
    const files = Array.from(e.target.files ?? []).slice(0, remaining);
    if (libraryInputRef.current) libraryInputRef.current.value = "";
    if (files.length === 0) return;

    if (files.find(isHeic)) {
      onHeicRejected();
      return;
    }

    const batch = files.map((f) => ({
      tempId: crypto.randomUUID(),
      file: f,
      fileName: f.name,
      previewUrl: null,
    }));
    setStagedPhotos((prev) => [...prev, ...batch]);
  }

  // ── Retry a failed photo (#545) ───────────────────────────────────────────
  function retryFailedPhoto(tempId: string) {
    const entry = failedPhotos.find((f) => f.tempId === tempId);
    if (!entry) return;
    setFailedPhotos((prev) => prev.filter((f) => f.tempId !== tempId));
    setPendingPhotos((prev) => [...prev, { tempId, fileName: entry.file.name }]);
    analyzeOneFile(entry.file, tempId, userContext.trim() || undefined);
  }

  function dismissFailedPhoto(tempId: string) {
    setFailedPhotos((prev) => prev.filter((x) => x.tempId !== tempId));
  }

  // ── Remove a staged photo before submit ───────────────────────────────────
  function removeStagedPhoto(tempId: string, previewUrl: string | null) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setStagedPhotos((prev) => prev.filter((p) => p.tempId !== tempId));
  }

  // ── Submit staged queue — moves staged → pending, fires analysis (#574) ──
  function submitStaged() {
    if (stagedPhotos.length === 0) return;
    const ctx = userContext.trim() || undefined;
    const toAnalyze = stagedPhotos;
    setPendingPhotos((prev) => [
      ...prev,
      ...toAnalyze.map((p) => ({ tempId: p.tempId, fileName: p.fileName })),
    ]);
    setStagedPhotos([]);
    for (const p of toAnalyze) {
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      analyzeOneFile(p.file, p.tempId, ctx);
    }
  }

  return {
    cameraInputRef,
    libraryInputRef,
    pendingPhotos,
    failedPhotos,
    stagedPhotos,
    clear,
    handleFileChange,
    handleFilesChange,
    retryFailedPhoto,
    dismissFailedPhoto,
    removeStagedPhoto,
    submitStaged,
  };
}
