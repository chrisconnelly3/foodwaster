import { describe, it, expect, vi } from "vitest";
import { selectSource } from "./selectSource.js";

describe("selectSource", () => {
  it("returns a function bound to the right grocer module", async () => {
    const mods = {
      krogerPrice: vi.fn().mockResolvedValue({ price_cents: 1, source: "api", confidence: 0.8, raw: "" }),
      targetPrice: vi.fn(),
      wholeFoodsPrice: vi.fn(),
    };
    const fn = selectSource("kroger", { wholeFoods: { scrape: false } } as any, mods as any);
    await fn({ grocer: "kroger", barcode: null, identity: { product_name: "x", brand: null, category: "produce", confidence: 1 } });
    expect(mods.krogerPrice).toHaveBeenCalled();
  });

  it("skips the whole foods scrape (returns null) when scrape is disabled", async () => {
    const mods = { krogerPrice: vi.fn(), targetPrice: vi.fn(), wholeFoodsPrice: vi.fn() };
    const fn = selectSource("whole_foods", { wholeFoods: { scrape: false } } as any, mods as any);
    const r = await fn({ grocer: "whole_foods", barcode: null, identity: { product_name: "x", brand: null, category: "produce", confidence: 1 } });
    expect(r).toBeNull();
    expect(mods.wholeFoodsPrice).not.toHaveBeenCalled();
  });

  it("uses the whole foods scrape when enabled", async () => {
    const mods = { krogerPrice: vi.fn(), targetPrice: vi.fn(), wholeFoodsPrice: vi.fn().mockResolvedValue(null) };
    const fn = selectSource("whole_foods", { wholeFoods: { scrape: true } } as any, mods as any);
    await fn({ grocer: "whole_foods", barcode: null, identity: { product_name: "x", brand: null, category: "produce", confidence: 1 } });
    expect(mods.wholeFoodsPrice).toHaveBeenCalled();
  });
});
