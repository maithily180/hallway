export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">What do you need?</h1>
      <form className="flex gap-2">
        <input
          name="want"
          placeholder="A projector tomorrow night under $35"
          className="flex-1 rounded-xl border border-border bg-surface px-4 py-3 outline-none focus:border-accent"
        />
        <button type="submit" className="rounded-xl bg-accent px-4 py-3 font-medium text-accent-foreground">
          Ask
        </button>
      </form>
    </main>
  );
}
