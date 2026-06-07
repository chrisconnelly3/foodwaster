import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseKrogerProducts } from "./kroger.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/kroger-product.json", "utf8"));

describe("kroger", () => {
  it("extracts the regular price in cents from the first product", () => {
    const r = parseKrogerProducts(fixture)!;
    expect(r.price_cents).toBe(499);
    expect(r.source).toBe("api");
    expect(r.confidence).toBeGreaterThan(0.7);
  });
  it("prefers promo price when present and lower", () => {
    const r = parseKrogerProducts({ data: [{ items: [{ price: { regular: 4.99, promo: 3.50 } }] }] })!;
    expect(r.price_cents).toBe(350);
  });
  it("returns null when no items", () => {
    expect(parseKrogerProducts({ data: [] })).toBeNull();
  });
});
