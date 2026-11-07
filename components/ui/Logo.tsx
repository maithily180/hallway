import { cx } from "./format";

/** Hallway wordmark: an open doorway in the accent colour. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex size-8 items-center justify-center rounded-[10px] bg-accent text-accent-foreground shadow-sm">
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16 M4 21h16 M14 12h.01" />
        </svg>
      </span>
      Hallway
    </span>
  );
}
