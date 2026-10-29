import { describe, expect, it } from "vitest";
import { formatCents } from "@/components/ui/format";

describe("formatCents", () => {
  it("drops zero cents", () => expect(formatCents(2800)).toBe("$28"));
  it("keeps fractional cents", () => expect(formatCents(2850)).toBe("$28.50"));
  it("groups thousands", () => expect(formatCents(150000)).toBe("$1,500"));
  it("handles zero", () => expect(formatCents(0)).toBe("$0"));
});
