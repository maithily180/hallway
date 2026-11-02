import { SellFlow } from "./SellFlow";

export const metadata = { title: "Sell or rent out · Hallway" };

export default function SellPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">Snap to list</h1>
      <SellFlow />
    </main>
  );
}
