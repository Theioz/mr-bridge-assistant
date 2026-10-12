"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

export interface OverflowMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Destructive actions read in the danger colour. */
  danger?: boolean;
  disabled?: boolean;
  /** Optional longer explanation, exposed as the item's title. */
  hint?: string;
}

interface Props {
  /** Accessible name for the trigger, e.g. "More actions for Buy milk". */
  label: string;
  items: OverflowMenuItem[];
  /** Trigger icon size; the hit area is fixed at 32px (44px on touch via .tasks-ui). */
  iconSize?: number;
  disabled?: boolean;
}

/**
 * Overflow ("⋯") menu — a trigger button plus a small popover menu (#761).
 *
 * WAI-ARIA menu-button pattern: the trigger carries aria-haspopup / aria-expanded; opening
 * moves focus to the first item; ArrowUp/ArrowDown/Home/End move between items; Escape closes
 * and returns focus to the trigger; Tab, an outside click, or choosing an item closes it.
 */
export default function OverflowMenu({ label, items, iconSize = 14, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const enabledIndexes = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);

  function focusItem(i: number) {
    itemRefs.current[i]?.focus();
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  // Focus the first enabled item when the menu opens.
  useEffect(() => {
    if (!open) return;
    const first = enabledIndexes[0];
    if (first !== undefined) focusItem(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Outside click closes without stealing focus back.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    const pos = enabledIndexes.indexOf(current);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(enabledIndexes[(pos + 1) % enabledIndexes.length]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(enabledIndexes[(pos - 1 + enabledIndexes.length) % enabledIndexes.length]);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(enabledIndexes[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(enabledIndexes[enabledIndexes.length - 1]);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className="relative flex-shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex items-center justify-center transition-opacity hover:opacity-70"
        style={{ width: 32, height: 32, color: "var(--color-text-faint)" }}
      >
        <MoreHorizontal size={iconSize} aria-hidden />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="overflow-menu"
          onKeyDown={onMenuKeyDown}
        >
          {items.map((it, i) => (
            <button
              key={it.key}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={it.disabled}
              title={it.hint}
              onClick={() => {
                close(true);
                it.onSelect();
              }}
              className="overflow-menu-item"
              data-danger={it.danger ? "" : undefined}
            >
              {it.icon && (
                <span className="flex-shrink-0 flex items-center" aria-hidden>
                  {it.icon}
                </span>
              )}
              <span>{it.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
