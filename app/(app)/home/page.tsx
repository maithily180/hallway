import Link from "next/link";

const EXAMPLES = ["A projector tomorrow night under $35 with HDMI", "Borrow a drill this weekend", "Buy a desk lamp under $20"];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">What do you need?</h1>
      <form action="/matches" className="flex gap-2">
        <input
          name="q"
          required
          placeholder="A projector tomorrow night under $35"
          className="flex-1 rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
        />
        <button type="submit" className="rounded-xl bg-accent px-4 py-3 font-medium text-accent-foreground">
          Ask
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((q) => (
          <Link
            key={q}
            href={`/matches?q=${encodeURIComponent(q)}`}
            className="rounded-full border border-border bg-surface px-3 py-1 text-sm text-muted hover:border-accent"
          >
            {q}
          </Link>
        ))}
      </div>
      <Link
        href="/sell"
        className="mt-4 rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm hover:border-accent"
      >
        <span className="font-medium">Have something to sell or rent out?</span>
        <span className="block text-muted">Snap a photo and Hallway drafts and prices it.</span>
      </Link>
    </main>
  );
}
