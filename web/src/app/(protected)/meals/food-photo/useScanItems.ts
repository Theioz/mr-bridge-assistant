import { useRef, useState } from "react";
import { compressImage } from "@/lib/meal-photo";
import type { ScanItem } from "./types";
import { applyEstimate, HEIC_MSG, isHeic } from "./utils";

// Completed scan items, plus per-item re-estimate and photo re-scan.
export function useScanItems() {
  const rescanInputRef = useRef<HTMLInputElement>(null);
  const rescanTargetIdRef = useRef<string | null>(null);

  const [items, setItems] = useState<ScanItem[]>([]);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [reestimatingId, setReestimatingId] = useState<string | null>(null);
  const [rescanningId, setRescanningId] = useState<string | null>(null);
  const [rescanError, setRescanError] = useState<{ id: string; msg: string } | null>(null);

  function addItem(item: ScanItem) {
    setItems((prev) => [...prev, item]);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (expandedItemId === id) setExpandedItemId(null);
  }

  function updateItem(id: string, patch: Partial<ScanItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function clearItems() {
    setItems([]);
  }

  // ── Per-item re-estimation ────────────────────────────────────────────────
  async function reestimateItem(id: string, ingredients: string) {
    setReestimatingId(id);
    const item = items.find((i) => i.id === id);
    try {
      const res = await fetch("/api/meals/estimate-macros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ingredients, user_context: item?.user_context }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Re-estimation failed");
      setItems((prev) => prev.map((it) => (it.id !== id ? it : applyEstimate(it, data))));
    } catch {
      // non-fatal — keep existing values
    } finally {
      setReestimatingId(null);
    }
  }

  // ── Per-item photo re-scan ────────────────────────────────────────────────
  async function rescanItem(file: File, itemId: string) {
    setRescanningId(itemId);
    setRescanError(null);
    const item = items.find((i) => i.id === itemId);
    let imageBlob: Blob;
    try {
      imageBlob = await compressImage(file);
    } catch {
      imageBlob = file;
    }
    const formData = new FormData();
    formData.append("image", imageBlob, "photo.jpg");
    formData.append("mode", "food");
    const ctx = item?.user_context?.trim() ?? "";
    if (ctx) formData.append("user_context", ctx);
    try {
      const res = await fetch("/api/meals/analyze-photo", { method: "POST", body: formData });
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) throw new Error("Analysis failed");
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Analysis failed");
      // Same manual-edit contract as reestimateItem.
      setItems((prev) => prev.map((it) => (it.id !== itemId ? it : applyEstimate(it, data))));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Re-scan failed";
      setRescanError({ id: itemId, msg });
    } finally {
      setRescanningId(null);
      rescanTargetIdRef.current = null;
      if (rescanInputRef.current) rescanInputRef.current.value = "";
    }
  }

  // Opens the hidden re-scan file input for one item.
  function startRescan(itemId: string) {
    rescanTargetIdRef.current = itemId;
    rescanInputRef.current?.click();
  }

  function handleRescanFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    const targetId = rescanTargetIdRef.current;
    if (!file || !targetId) return;
    if (isHeic(file)) {
      setRescanError({ id: targetId, msg: HEIC_MSG });
      if (rescanInputRef.current) rescanInputRef.current.value = "";
      rescanTargetIdRef.current = null;
      return;
    }
    rescanItem(file, targetId);
  }

  return {
    items,
    expandedItemId,
    setExpandedItemId,
    reestimatingId,
    rescanningId,
    rescanError,
    rescanInputRef,
    addItem,
    removeItem,
    updateItem,
    clearItems,
    reestimateItem,
    startRescan,
    handleRescanFileChange,
  };
}
