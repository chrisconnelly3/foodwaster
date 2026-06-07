import { describe, it, expect, vi } from "vitest";
import { selectSource } from "./selectSource.js";

describe("selectSource", () => {
  it("returns a function bound to the right grocer module", async () => {
    const mods = {
      krogerPrice: vi.fn().mockResolvedValue({ price_cents: 1, source: "api", confidence: 0.8, raw: "" }),
      targetPrice: vi.fn(),
      wholeFoodsPrice: vi.fn(),
    };
    const fn = selectSource("kroger", {} as any, mods as any);
    await fn({ grocer: "kroger", barcode: null, identity: { product_name: "x", brand: null, category: "produce", confidence: 1 } });
    expect(mods.krogerPrice).toHaveBeenCalled();
  });
});
