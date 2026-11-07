"use client";

import { Icon } from "@/components/ui";

export function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/login");
  }
  return (
    <button
      type="button"
      onClick={logout}
      aria-label="Log out"
      title="Log out"
      className="flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
    >
      <Icon name="logout" className="size-[18px]" />
    </button>
  );
}
