import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": here("."), "server-only": here("tests/stubs/server-only.ts") } },
  test: { include: ["tests/**/*.test.ts"], passWithNoTests: true },
});
