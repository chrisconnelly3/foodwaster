import { describe, it, expect } from "vitest";
import { parseVisionJson } from "./visionIdentifier.js";

describe("visionIdentifier", () => {
  it("parses a well-formed model JSON block", () => {
    const r = parseVisionJson('Here you go:\n{"product_name":"Avocado","brand":null,"category":"produce","confidence":0.8}')!;
    expect(r.product_name).toBe("Avocado");
    expect(r.category).toBe("produce");
  });
  it("returns null on unparseable text", () => {
    expect(parseVisionJson("no json here")).toBeNull();
  });
  it("clamps confidence to 0..1 and defaults category to other", () => {
    const r = parseVisionJson('{"product_name":"Mystery","confidence":5}')!;
    expect(r.confidence).toBe(1);
    expect(r.category).toBe("other");
  });
});
