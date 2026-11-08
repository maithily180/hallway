// Fails if seller floor or auto-accept values are reachable from agent or prompt code.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const roots = ["lib/agents", "lib/llm/prompts"];
const banned = /\b(floorCents|autoAcceptCents)\b/;
const hits = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (banned.test(readFileSync(p, "utf8"))) hits.push(p);
  }
}

for (const r of roots) if (existsSync(r)) walk(r);
if (hits.length) {
  console.error("floorCents/autoAcceptCents found in:\n" + hits.join("\n"));
  process.exit(1);
}
console.log("check:floor ok");
