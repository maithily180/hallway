"use client";

export function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/login");
  }
  return (
    <button type="button" onClick={logout} className="text-sm text-muted hover:text-foreground">
      Log out
    </button>
  );
}
