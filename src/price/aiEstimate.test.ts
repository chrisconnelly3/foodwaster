import { describe, it, expect } from "vitest";
import { parseEstimate, buildEstimatePrompt } from "./aiEstimate.js";
import type { PriceQuery } from "./types.js";

const q = (grocer: PriceQuery["grocer"]): PriceQuery => ({
  grocer, barcode: null,
  identity: { product_name: "Heavy Cream", brand: "Organic Valley", category: "dairy", confidence: 1 },
});

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
  it("includes the product, store, and premium context for Whole Foods", () => {
    const p = buildEstimatePrompt(q("whole_foods"));
    expect(p).toContain("Organic Valley Heavy Cream");
    expect(p).toContain("Whole Foods");
    expect(p.toLowerCase()).toContain("premium");
    expect(p.toLowerCase()).toContain("higher");
  });
  it("uses mainstream/average context for Kroger and Target", () => {
    expect(buildEstimatePrompt(q("kroger")).toLowerCase()).toContain("average");
    expect(buildEstimatePrompt(q("target")).toLowerCase()).toContain("competitive");
  });
});
