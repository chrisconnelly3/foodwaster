import { describe, it, expect } from "vitest";
import { parseEstimate } from "./aiEstimate.js";

describe("aiEstimate", () => {
  it("parses dollars from model JSON", () => {
    const r = parseEstimate('{"price_usd": 5.99}')!;
    expect(r.price_cents).toBe(599);
    expect(r.source).toBe("ai_estimate");
    expect(r.confidence).toBeLessThan(0.6);
  });
  it("returns null when no price present", () => {
    expect(parseEstimate("dunno")).toBeNull();
  });
});
