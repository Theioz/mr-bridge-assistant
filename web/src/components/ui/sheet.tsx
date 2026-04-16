"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { ReactNode } from "react";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  contentClassName?: string;
  contentStyle?: React.CSSProperties;
  /**
   * Hide the default visible header (title + close button). Use when the
   * consumer renders its own header. Radix focus-trap and labelling are
   * preserved either way (@radix-ui/react-dialog >= 1.1 provides focus-trap).
   */
  hideHeader?: boolean;
}

export default function Sheet({
  open,
  onOpenChange,
  title,
  children,
  contentClassName,
  contentStyle,
  hideHeader,
}: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="lg:hidden fixed inset-0 z-[60] print:hidden"
          style={{ background: "var(--overlay-scrim)" }}
        />
        <Dialog.Content
          className={
            "lg:hidden fixed left-0 right-0 bottom-0 z-[70] rounded-t-2xl print:hidden " +
            (contentClassName ?? "")
          }
          style={{
            background: "var(--color-surface)",
            borderTop: "1px solid var(--color-border)",
            paddingBottom: "env(safe-area-inset-bottom)",
            ...contentStyle,
          }}
          aria-describedby={undefined}
        >
          {hideHeader ? (
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
          ) : (
            <div
              className="flex items-center justify-between px-5 pt-4 pb-3"
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <Dialog.Title
                className="text-sm font-semibold"
                style={{ color: "var(--color-text)" }}
              >
                {title}
              </Dialog.Title>
              <Dialog.Close
                aria-label="Close"
                className="flex items-center justify-center rounded transition-colors cursor-pointer"
                style={{
                  color: "var(--color-text-muted)",
                  background: "transparent",
                  border: "none",
                  padding: 8,
                  minWidth: 44,
                  minHeight: 44,
                }}
              >
                <X size={18} />
              </Dialog.Close>
            </div>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
