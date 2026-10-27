"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Tone } from "@/lib/jobs/table";

export type PillOption<V extends string> = { value: V; label: string; tone: Tone };

/** A read-only Notion-style pill. */
export function Pill({ label, tone }: { label: string; tone?: Tone }) {
  return (
    <span className="jobs-pill" data-tone={tone}>
      {label}
    </span>
  );
}

/**
 * A pill that opens a small menu of pills to change the value (Notion's select property).
 * Menu-button pattern: Enter/Space/ArrowDown opens and focuses the current option; ArrowUp/Down,
 * Home/End move; Escape closes and returns focus; an outside click, Tab or scrolling closes. The
 * menu is position: fixed so the table's horizontal scroller cannot clip it.
 */
export function PillSelect<V extends string>({
  value,
  options,
  onChange,
  label,
  emptyLabel = "Empty",
  clearLabel,
  disabled,
}: {
  value: V | null;
  options: PillOption<V>[];
  onChange: (v: V | null) => void;
  /** Accessible name, e.g. "Status for Acme Senior TPM". */
  label: string;
  emptyLabel?: string;
  /** When set, the menu ends with an item that clears the value. */
  clearLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();
  const current = options.find((o) => o.value === value) ?? null;
  const count = options.length + (clearLabel ? 1 : 0);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  // Place the menu under the trigger, flipping above it near the bottom of the viewport.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const h = Math.min(count * 40 + 12, window.innerHeight * 0.6);
    const top = r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4;
    setPos({ top, left: Math.max(8, Math.min(r.left, window.innerWidth - 184)) });
  }, [open, count]);

  useEffect(() => {
    if (!open || !pos) return;
    const i = Math.max(
      0,
      options.findIndex((o) => o.value === value),
    );
    itemRefs.current[i]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    }
    function onScroll(e: Event) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  function onMenuKeyDown(e: React.KeyboardEvent) {
    const i = itemRefs.current.findIndex((el) => el === document.activeElement);
    const go = (n: number) => {
      e.preventDefault();
      itemRefs.current[(n + count) % count]?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // a peek behind the menu must not close too
      close(true);
    } else if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(count - 1);
    else if (e.key === "Tab") setOpen(false);
  }

  function choose(v: V | null) {
    close(true);
    if (v !== value) onChange(v);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="jobs-pill-btn"
        aria-label={`${label}: ${current?.label ?? emptyLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {current ? (
          <Pill label={current.label} tone={current.tone} />
        ) : (
          <span className="jobs-pill jobs-pill-empty">{emptyLabel}</span>
        )}
      </button>
      {open && pos && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className="jobs-pill-menu"
          style={{ top: pos.top, left: pos.left }}
          onKeyDown={onMenuKeyDown}
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((o, i) => (
            <button
              key={o.value}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={o.value === value}
              tabIndex={-1}
              className="jobs-pill-option"
              onClick={() => choose(o.value)}
            >
              <Pill label={o.label} tone={o.tone} />
            </button>
          ))}
          {clearLabel && (
            <button
              ref={(el) => {
                itemRefs.current[options.length] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className="jobs-pill-option jobs-faint"
              style={{ fontSize: "var(--t-micro)" }}
              onClick={() => choose(null)}
            >
              {clearLabel}
            </button>
          )}
        </div>
      )}
    </>
  );
}
