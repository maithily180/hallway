import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inspectCondition } from "@/lib/agents/inspector";
import { DEMO_LISTINGS } from "@/seed/demo";

type Case = { id: string; category: string; before: string[]; after: string[]; damaged: boolean };

const DIR = join(__dirname, "fixtures/inspection");
const CASES: Case[] = JSON.parse(readFileSync(join(DIR, "cases.json"), "utf8"));
const TARGET = 8;

const dataUrl = (file: string) => `data:image/jpeg;base64,${readFileSync(join(DIR, file)).toString("base64")}`;
const missing = CASES.flatMap((c) => [...c.before, ...c.after]).filter((f) => !existsSync(join(DIR, f)));
const ready = Boolean(process.env.ANTHROPIC_API_KEY) && process.env.MOCK_LLM !== "1" && missing.length === 0;

const listingFor = (category: string) => DEMO_LISTINGS.find((l) => l.category === category) ?? DEMO_LISTINGS[0];

describe.skipIf(!ready)(`inspector eval (${CASES.length} photo pairs)`, () => {
  it(`gets at least ${TARGET}/${CASES.length} right`, { timeout: 300_000 }, async () => {
    const rows = [];
    for (const c of CASES) {
      const r = await inspectCondition(c.before.map(dataUrl), c.after.map(dataUrl), listingFor(c.category));
      const flagged = r.newDamage.length > 0 || r.missingParts.length > 0 || !r.sameItem;
      rows.push({ id: c.id, expected: c.damaged, flagged, ok: flagged === c.damaged, confidence: r.confidence, summary: r.summary });
    }
    console.table(rows);
    expect(rows.filter((r) => r.ok).length).toBeGreaterThanOrEqual(TARGET);
  });
});

if (!ready) console.warn(`inspector eval skipped: needs ANTHROPIC_API_KEY and photos (${missing.length} missing in ${DIR})`);
