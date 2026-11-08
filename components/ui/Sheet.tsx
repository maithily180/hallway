"use client";

import { useEffect, type ReactNode } from "react";

/** Bottom sheet on mobile, centred dialog on wider screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button aria-label="Close" className="absolute inset-0 bg-foreground/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-lg rounded-t-3xl bg-surface p-5 shadow-xl sm:rounded-3xl"
      >
        {title && <h2 className="mb-3 text-lg font-semibold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
