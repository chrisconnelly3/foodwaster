import { describe, it, expect, vi } from "vitest";
import { resolvePrice } from "./resolvePrice.js";
import type { PriceQuery, PriceResult } from "./types.js";

const q: PriceQuery = { grocer: "kroger", barcode: null, identity: { product_name: "X", brand: null, category: "produce", confidence: 0.9 } };

describe("resolvePrice", () => {
  it("uses the grocer source when it succeeds", async () => {
    const source = vi.fn().mockResolvedValue({ price_cents: 499, source: "api", confidence: 0.8, raw: "{}" } as PriceResult);
    const estimate = vi.fn();
    const r = await resolvePrice(q, { source, estimate });
    expect(r.price_cents).toBe(499);
    expect(estimate).not.toHaveBeenCalled();
  });
  it("falls back to estimate when source returns null", async () => {
    const source = vi.fn().mockResolvedValue(null);
    const estimate = vi.fn().mockResolvedValue({ price_cents: 599, source: "ai_estimate", confidence: 0.4, raw: "{}" } as PriceResult);
    const r = await resolvePrice(q, { source, estimate });
    expect(r.source).toBe("ai_estimate");
  });
  it("falls back to estimate when source throws", async () => {
    const source = vi.fn().mockRejectedValue(new Error("boom"));
    const estimate = vi.fn().mockResolvedValue({ price_cents: 100, source: "ai_estimate", confidence: 0.4, raw: "{}" } as PriceResult);
    const r = await resolvePrice(q, { source, estimate });
    expect(r.price_cents).toBe(100);
  });
  it("throws when both source and estimate fail", async () => {
    await expect(resolvePrice(q, { source: async () => null, estimate: async () => null })).rejects.toThrow();
  });
  it("propagates when source returns null and estimate throws", async () => {
    const source = vi.fn().mockResolvedValue(null);
    const estimate = vi.fn().mockRejectedValue(new Error("estimate boom"));
    await expect(resolvePrice(q, { source, estimate })).rejects.toThrow("estimate boom");
  });
  it("times out a hanging source and falls back to estimate", async () => {
    const source = () => new Promise<PriceResult | null>(() => {}); // never settles
    const estimate = vi.fn().mockResolvedValue({ price_cents: 250, source: "ai_estimate", confidence: 0.4, raw: "{}" } as PriceResult);
    const r = await resolvePrice(q, { source, estimate }, { timeoutMs: 30 });
    expect(r.price_cents).toBe(250);
  });
  it("throws (never hangs) when both source and estimate stall", async () => {
    const hang = () => new Promise<PriceResult | null>(() => {});
    await expect(resolvePrice(q, { source: hang, estimate: hang }, { timeoutMs: 30 })).rejects.toThrow();
  });
});
