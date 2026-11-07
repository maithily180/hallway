/** Skeleton shown while a screen's agents work (parsing a want, ranking matches). */
export default function Loading() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-2/3 animate-pulse rounded-lg bg-border/70" />
      <div className="flex gap-2">
        {[16, 20, 14].map((w) => (
          <div key={w} className="h-6 animate-pulse rounded-full bg-border/70" style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
          <div className="h-5 w-1/2 animate-pulse rounded bg-border/70" />
          <div className="h-4 w-full animate-pulse rounded bg-border/50" />
          <div className="h-9 w-28 animate-pulse rounded-xl bg-border/60" />
        </div>
      ))}
    </main>
  );
}
