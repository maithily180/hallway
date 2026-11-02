import { LoginForm } from "./LoginForm";

export const metadata = { title: "Log in · Hallway" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/home";
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Hallway</h1>
        <p className="text-sm text-muted">Your campus already owns it. Log in with your campus email.</p>
      </div>
      <LoginForm next={safeNext} domain={process.env.CAMPUS_EMAIL_DOMAIN ?? ""} />
    </main>
  );
}
