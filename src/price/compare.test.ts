import { describe, it, expect, vi } from "vitest";
import { cheapestAcross } from "./compare.js";
import type { PriceQuery, PriceResult } from "./types.js";

const identity = { product_name: "Blueberries", brand: null, category: "produce", confidence: 1 };

describe("cheapestAcross", () => {
  it("returns the lowest-priced grocer result", async () => {
    const priceBy = (g: string): Promise<PriceResult | null> =>
      Promise.resolve({ whole_foods: { price_cents: 699, source: "scrape", confidence: 0.6, raw: "" },
                        kroger: { price_cents: 499, source: "api", confidence: 0.8, raw: "" },
                        target: { price_cents: 649, source: "api", confidence: 0.7, raw: "" } }[g] as PriceResult);
    const fn = vi.fn((q: PriceQuery) => priceBy(q.grocer));
    const r = await cheapestAcross(identity, fn);
    expect(r.cheapest.grocer).toBe("kroger");
    expect(r.cheapest.price_cents).toBe(499);
    expect(r.all.length).toBe(3);
  });

  it("skips grocers that return null", async () => {
    const fn = vi.fn((q: PriceQuery) =>
      Promise.resolve(q.grocer === "target" ? { price_cents: 300, source: "api", confidence: 0.7, raw: "" } as PriceResult : null));
    const r = await cheapestAcross(identity, fn);
    expect(r.cheapest.grocer).toBe("target");
    expect(r.all.length).toBe(1);
  });

  it("throws when no grocer returns a price", async () => {
    await expect(cheapestAcross(identity, async () => null)).rejects.toThrow();
  });
});
