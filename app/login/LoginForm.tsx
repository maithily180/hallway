"use client";

import { useState, type FormEvent } from "react";
import { Button, Card } from "@/components/ui";

const field = "w-full rounded-xl border border-border bg-surface px-3 py-2 outline-none focus:border-accent";

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
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
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
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input name="password" type="password" required autoComplete="current-password" className={field} />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={busy}>
          {busy ? "Logging in…" : "Log in"}
        </Button>
      </form>
    </Card>
  );
}
