import { describe, it, expect } from "vitest";
import { totalCents, byCategory, byGrocer, repeatOffenders, projectedAnnualCents, weeklyTrend } from "./stats.js";
import type { WasteItem } from "../types.js";

function item(p: Partial<WasteItem>): WasteItem {
  return { id: 1, captured_at: "2026-06-07T00:00:00Z", grocer: "whole_foods", capture_type: "barcode",
    barcode: null, photo_path: null, product_name: "X", brand: null, category: "produce",
    status: "priced", price_cents: 100, price_source: "api", confidence: 1, qty: 1, notes: null, ...p };
}

describe("stats", () => {
  const items = [
    item({ id: 1, price_cents: 599, qty: 1, category: "produce", grocer: "whole_foods", product_name: "Blueberries" }),
    item({ id: 2, price_cents: 599, qty: 1, category: "produce", grocer: "whole_foods", product_name: "Blueberries" }),
    item({ id: 3, price_cents: 1000, qty: 2, category: "meat", grocer: "kroger", product_name: "Steak" }),
  ];

  it("totals cents with quantity", () => {
    // 599 + 599 + 1000*2 = 3198
    expect(totalCents(items)).toBe(3198);
  });

  it("groups by category", () => {
    const cats = byCategory(items);
    expect(cats.find(c => c.category === "produce")!.cents).toBe(1198);
    expect(cats.find(c => c.category === "meat")!.cents).toBe(2000);
  });

  it("groups by grocer with percentage", () => {
    const g = byGrocer(items);
    const wf = g.find(x => x.grocer === "whole_foods")!;
    expect(wf.cents).toBe(1198);
    expect(Math.round(wf.pct)).toBe(37); // 1198/3198
  });

  it("finds repeat offenders sorted by total", () => {
    const ro = repeatOffenders(items);
    expect(ro[0].name).toBe("Blueberries");
    expect(ro[0].count).toBe(2);
    expect(ro[0].cents).toBe(1198);
  });

  it("projects annual from a weekly total", () => {
    expect(projectedAnnualCents(3198, "weekly")).toBe(3198 * 52);
    expect(projectedAnnualCents(3198, "monthly")).toBe(3198 * 12);
  });

  it("builds a weekly trend series", () => {
    const trend = weeklyTrend([
      item({ captured_at: "2026-05-25T00:00:00Z", price_cents: 500, qty: 1 }), // week of May 25
      item({ captured_at: "2026-06-01T00:00:00Z", price_cents: 700, qty: 1 }), // week of Jun 1
      item({ captured_at: "2026-06-03T00:00:00Z", price_cents: 300, qty: 1 }), // same week
    ], "UTC");
    expect(trend.length).toBe(2);
    expect(trend[1].cents).toBe(1000);
  });
});
