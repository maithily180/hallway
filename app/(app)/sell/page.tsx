import Link from "next/link";
import { SellFlow } from "./SellFlow";

export const metadata = { title: "Sell or rent out · Hallway" };

export default function SellPage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Snap to list</h1>
        <Link href="/sell/moveout" className="text-sm font-medium text-accent">
          Moving out? List it all
        </Link>
      </div>
      <SellFlow />
    </main>
  );
}
