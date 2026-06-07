import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseOffResponse, mapOffCategory } from "./openFoodFacts.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/off-blueberries.json", "utf8"));

describe("openFoodFacts", () => {
  it("parses a product response", () => {
    const r = parseOffResponse(fixture)!;
    expect(r.product_name).toBe("Organic Blueberries");
    expect(r.brand).toBe("365");
    expect(r.category).toBe("produce");
    expect(r.confidence).toBeGreaterThan(0.7);
  });
  it("returns null when status is 0", () => {
    expect(parseOffResponse({ status: 0 })).toBeNull();
  });
  it("maps OFF category tags to our taxonomy", () => {
    expect(mapOffCategory(["en:dairies", "en:milks"])).toBe("dairy");
    expect(mapOffCategory(["en:unknown"])).toBe("other");
  });
});
