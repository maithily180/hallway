import { Icon, Logo, type IconName } from "@/components/ui";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Log in · Hallway" };

const POINTS: { icon: IconName; title: string; body: string }[] = [
  { icon: "search", title: "Ask for anything", body: "“A projector tomorrow under $35” finds it on campus." },
  { icon: "spark", title: "Agents do the deal", body: "Listings, prices and offers are handled for you." },
  { icon: "shield", title: "Deposits held safely", body: "Paid with PayPal and released when the item comes back." },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/home";
  return (
    <main className="grid min-h-dvh md:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-foreground p-10 text-background md:flex md:flex-col md:justify-between">
        <span className="pointer-events-none absolute -left-24 -top-24 size-96 rounded-full bg-accent/35 blur-3xl" aria-hidden />
        <Logo className="relative text-lg" />
        <div className="relative flex flex-col gap-8">
          <h2 className="max-w-md text-4xl font-semibold leading-tight">Your campus already owns it.</h2>
          <ul className="flex flex-col gap-5">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background/10">
                  <Icon name={p.icon} className="size-[18px]" />
                </span>
                <span className="text-sm">
                  <span className="block font-medium">{p.title}</span>
                  <span className="text-background/70">{p.body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-background/50">For students with a campus email.</p>
      </section>

      <section className="flex flex-col justify-center px-4 py-10">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
          <Logo className="md:hidden" />
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">Welcome back</h1>
            <p className="text-sm text-muted">Log in with your campus email to borrow, rent and sell nearby.</p>
          </div>
          <LoginForm next={safeNext} domain={process.env.CAMPUS_EMAIL_DOMAIN ?? ""} />
        </div>
      </section>
    </main>
  );
}
