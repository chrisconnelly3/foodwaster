import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseTargetSearch } from "./target.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/target-search.json", "utf8"));

describe("target", () => {
  it("extracts current retail in cents", () => {
    const r = parseTargetSearch(fixture)!;
    expect(r.price_cents).toBe(649);
    expect(r.source).toBe("api");
  });
  it("returns null when no products", () => {
    expect(parseTargetSearch({ data: { search: { products: [] } } })).toBeNull();
  });
});
