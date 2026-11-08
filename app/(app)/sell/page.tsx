import Link from "next/link";
import { buttonClass, Icon } from "@/components/ui";
import { SellFlow } from "./SellFlow";

export const metadata = { title: "Sell or rent out · Hallway" };

export default function SellPage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Snap to list</h1>
          <p className="text-muted">Photos in, listing out. You set the floor; Hallway never reveals it.</p>
        </div>
        <Link href="/sell/moveout" className={buttonClass("secondary", "sm")}>
          <Icon name="video" className="size-4" /> Moving out? List it all
        </Link>
      </div>
      <SellFlow />
    </main>
  );
}
