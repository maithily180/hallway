"use client";

import { useState, type FormEvent } from "react";
import { Button, Card } from "@/components/ui";

const field = "h-11 w-full rounded-xl border border-border bg-surface px-3 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15";

export function LoginForm({ next, domain }: { next: string; domain: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    if (res.ok) {
      window.location.assign(next);
      return;
    }
    setBusy(false);
    setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Could not log in.");
  }

  return (
    <Card className="p-6 shadow-md">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Campus email
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder={domain ? `you@${domain}` : "you@campus.edu"}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Password
          <input name="password" type="password" required autoComplete="current-password" className={field} />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" size="lg" disabled={busy} className="mt-1">
          {busy ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </Card>
  );
}
