import { describe, it, expect } from "vitest";
import { formatCents, dollarsToCents } from "./money.js";

describe("money", () => {
  it("formats cents as USD", () => {
    expect(formatCents(4713)).toBe("$47.13");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(599)).toBe("$5.99");
  });
  it("parses dollars to cents", () => {
    expect(dollarsToCents("5.99")).toBe(599);
    expect(dollarsToCents("12")).toBe(1200);
  });
});
