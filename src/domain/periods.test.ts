import { describe, it, expect } from "vitest";
import { weekBounds, monthBounds } from "./periods.js";

describe("periods", () => {
  it("computes Mon-Sun week bounds containing a date", () => {
    // 2026-06-07 is a Sunday
    const { startIso, endIso, label } = weekBounds(new Date("2026-06-07T18:00:00Z"), "UTC");
    expect(startIso).toBe("2026-06-01T00:00:00.000Z"); // Monday
    expect(endIso).toBe("2026-06-08T00:00:00.000Z");   // next Monday (exclusive)
    expect(label).toContain("Jun");
  });
  it("computes calendar-month bounds", () => {
    const { startIso, endIso } = monthBounds(new Date("2026-06-15T00:00:00Z"), "UTC");
    expect(startIso).toBe("2026-06-01T00:00:00.000Z");
    expect(endIso).toBe("2026-07-01T00:00:00.000Z");
  });
});
