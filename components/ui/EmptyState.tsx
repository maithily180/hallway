import type { ReactNode } from "react";

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface/60 px-6 py-12 text-center">
      <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-surface-2 text-muted" aria-hidden>
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 7l8-4 8 4v10l-8 4-8-4V7Z M4 7l8 4 8-4 M12 11v10" strokeLinejoin="round" />
        </svg>
      </span>
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
