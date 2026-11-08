"use client";

import { useEffect } from "react";
import { Button, EmptyState } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <EmptyState
        title="Something went wrong"
        body="Hallway couldn't load this screen. Your listings and deals are safe."
        action={<Button onClick={reset}>Try again</Button>}
      />
    </main>
  );
}
