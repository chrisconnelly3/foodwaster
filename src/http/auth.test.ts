import { describe, it, expect } from "vitest";
import { checkPasscode } from "./auth.js";

describe("checkPasscode", () => {
  it("accepts the matching passcode header", () => {
    expect(checkPasscode("secret", "secret")).toBe(true);
  });
  it("rejects a wrong or missing passcode", () => {
    expect(checkPasscode("secret", "nope")).toBe(false);
    expect(checkPasscode("secret", undefined)).toBe(false);
  });
});
