import { describe, it, expect } from "vitest";
import { buildSummary } from "./summaryBuilder.js";
import type { WasteItem } from "../types.js";

function item(p: Partial<WasteItem>): WasteItem {
  return { id: 1, captured_at: "2026-06-02T00:00:00Z", grocer: "whole_foods", capture_type: "barcode",
    barcode: null, photo_path: null, product_name: "Blueberries", brand: null, category: "produce",
    status: "priced", price_cents: 599, price_source: "api", confidence: 1, qty: 1, notes: null, ...p };
}

describe("buildSummary", () => {
  it("assembles totals, breakdowns, offenders, projection", () => {
    const periodItems = [item({ id: 1 }), item({ id: 2 })];
    const s = buildSummary({
      periodType: "weekly", periodLabel: "Jun 1 – Jun 7",
      periodStart: "2026-06-01", periodEnd: "2026-06-08",
      periodItems, allItems: periodItems, tz: "UTC",
    });
    expect(s.totalCents).toBe(1198);
    expect(s.itemCount).toBe(2);
    expect(s.projectedAnnualCents).toBe(1198 * 52);
    expect(s.worstGrocer.grocer).toBe("whole_foods");
    expect(s.repeatOffenders[0].name).toBe("Blueberries");
  });
});
