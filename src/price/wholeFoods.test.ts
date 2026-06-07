import { describe, it, expect } from "vitest";
import { parsePriceString } from "./wholeFoods.js";

describe("wholeFoods price parsing", () => {
  it("parses a dollar/cents price from text fragments", () => {
    expect(parsePriceString("$5", "99")).toBe(599);
    expect(parsePriceString("$12", "00")).toBe(1200);
  });
  it("parses a combined price string", () => {
    expect(parsePriceString("$4.49")).toBe(449);
  });
  it("returns null on garbage", () => {
    expect(parsePriceString("see price in cart")).toBeNull();
  });
});
