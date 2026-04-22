"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

type ToastState = {
  id: number;
  message: string;
  onUndo: () => void;
  durationMs: number;
} | null;

type ToastContextValue = {
  show: (message: string, onUndo: () => void, durationMs?: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function UndoToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setToast(null);
  }, []);

  const show = useCallback((message: string, onUndo: () => void, durationMs = 5000) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const id = ++idRef.current;
    setToast({ id, message, onUndo, durationMs });
    timerRef.current = setTimeout(() => {
      setToast((t) => (t && t.id === id ? null : t));
      timerRef.current = null;
    }, durationMs);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            left: "50%",
            bottom: "calc(24px + env(safe-area-inset-bottom))",
            transform: "translateX(-50%)",
            zIndex: 100,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 14px",
            background: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            boxShadow: "var(--shadow-md)",
            color: "var(--color-text)",
            fontSize: 13,
            minWidth: 240,
          }}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => {
              toast.onUndo();
              clear();
            }}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--color-primary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              padding: "2px 6px",
            }}
          >
            Undo
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useUndoToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useUndoToast must be used inside UndoToastProvider");
  return ctx;
}
