"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ReactNode } from "react";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  contentClassName?: string;
  contentStyle?: React.CSSProperties;
}

export default function Sheet({
  open,
  onOpenChange,
  title,
  children,
  contentClassName,
  contentStyle,
}: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="lg:hidden fixed inset-0 z-[60]"
          style={{ background: "rgba(0,0,0,0.6)" }}
        />
        <Dialog.Content
          className={
            "lg:hidden fixed left-0 right-0 bottom-0 z-[70] rounded-t-2xl " +
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
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
