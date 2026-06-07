import { describe, it, expect, beforeEach, vi } from "vitest";
import { openDb, migrate, DB } from "../db/connection.js";
import { WasteItemsRepo } from "../db/repositories/wasteItems.js";
import { PriceChecksRepo } from "../db/repositories/priceChecks.js";
import { processItem, onProcessError, MAX_ATTEMPTS } from "./worker.js";

let db: DB; let items: WasteItemsRepo; let checks: PriceChecksRepo;
beforeEach(() => { db = openDb(":memory:"); migrate(db); items = new WasteItemsRepo(db); checks = new PriceChecksRepo(db); });

describe("processItem", () => {
  it("identifies, prices, and marks the item priced", async () => {
    const id = items.create({ grocer: "kroger", capture_type: "barcode", barcode: "012" }, "2026-06-07T00:00:00Z");
    const deps = {
      items, checks,
      identify: vi.fn().mockResolvedValue({ product_name: "Eggs", brand: null, category: "dairy", confidence: 0.85 }),
      resolve: vi.fn().mockResolvedValue({ price_cents: 499, source: "api", confidence: 0.8, raw: "{}" }),
      now: () => "2026-06-07T00:00:05Z",
    };
    await processItem(items.get(id)!, deps as any);
    const updated = items.get(id)!;
    expect(updated.status).toBe("priced");
    expect(updated.product_name).toBe("Eggs");
    expect(updated.price_cents).toBe(499);
    expect(checks.listForItem(id).length).toBeGreaterThanOrEqual(1);
  });

  it("throws (for retry) when identify returns null", async () => {
    const id = items.create({ grocer: "kroger", capture_type: "barcode", barcode: "012" }, "2026-06-07T00:00:00Z");
    const deps = { items, checks, identify: vi.fn().mockResolvedValue(null), resolve: vi.fn(), now: () => "x" };
    await expect(processItem(items.get(id)!, deps as any)).rejects.toThrow();
    expect(deps.resolve).not.toHaveBeenCalled();
  });
});

describe("onProcessError", () => {
  it("retries below max attempts and fails at max", () => {
    const id = items.create({ grocer: "kroger", capture_type: "barcode" }, "2026-06-07T00:00:00Z");
    const item = items.get(id)!;
    expect(onProcessError(item, 0, { items })).toBe("retry");
    expect(onProcessError(item, MAX_ATTEMPTS - 1, { items })).toBe("failed");
    expect(items.get(id)!.status).toBe("failed");
  });
});
