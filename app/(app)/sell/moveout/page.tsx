import Link from "next/link";
import { MoveOutFlow } from "./MoveOutFlow";

export const metadata = { title: "Move-out mode · Hallway" };

export default function MoveOutPage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-6">
      <Link href="/sell" className="text-sm text-muted">
        ← One item
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Move-out mode</h1>
        <p className="text-sm text-muted">Film your room or pick a few photos. Hallway drafts and prices every item for a fast sale.</p>
      </div>
      <MoveOutFlow />
    </main>
  );
}
