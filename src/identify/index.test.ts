import { describe, it, expect, vi } from "vitest";
import { identifyItem } from "./index.js";
import type { WasteItem } from "../types.js";

function item(p: Partial<WasteItem>): WasteItem {
  return { id: 1, captured_at: "x", grocer: "kroger", capture_type: "barcode", barcode: null,
    photo_path: null, product_name: null, brand: null, category: null, status: "pending",
    price_cents: null, price_source: null, confidence: null, qty: 1, notes: null, ...p };
}

describe("identifyItem", () => {
  it("routes barcode items to the barcode lookup", async () => {
    const deps = {
      lookupBarcode: vi.fn().mockResolvedValue({ product_name: "Eggs", brand: null, category: "dairy", confidence: 0.85 }),
      identifyPhoto: vi.fn(),
    };
    const r = await identifyItem(item({ capture_type: "barcode", barcode: "012" }), deps as any);
    expect(deps.lookupBarcode).toHaveBeenCalledWith("012");
    expect(r!.product_name).toBe("Eggs");
  });
  it("routes photo items to vision", async () => {
    const deps = {
      lookupBarcode: vi.fn(),
      identifyPhoto: vi.fn().mockResolvedValue({ product_name: "Kale", brand: null, category: "produce", confidence: 0.7 }),
      readPhoto: vi.fn().mockResolvedValue({ base64: "AAA", mediaType: "image/jpeg" }),
    };
    const r = await identifyItem(item({ capture_type: "photo", photo_path: "/x.jpg" }), deps as any);
    expect(deps.identifyPhoto).toHaveBeenCalled();
    expect(r!.product_name).toBe("Kale");
  });
});
