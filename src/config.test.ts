import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("parses required values from an env object", () => {
    const cfg = loadConfig({
      APP_TZ: "America/Chicago",
      APP_PASSCODE: "secret",
      WIFE_EMAIL: "w@x.com",
      EMAIL_FROM: "Bot <bot@x.com>",
      DATA_DIR: "./data",
      ANTHROPIC_API_KEY: "a",
      RESEND_API_KEY: "r",
    });
    expect(cfg.passcode).toBe("secret");
    expect(cfg.tz).toBe("America/Chicago");
    expect(cfg.dataDir).toBe("./data");
  });

  it("throws when a required value is missing", () => {
    expect(() => loadConfig({})).toThrow();
  });
});
