import { describe, it, expect, beforeEach } from "vitest";
import { openDb, migrate, DB } from "../connection.js";
import { WasteItemsRepo } from "./wasteItems.js";
import { PriceChecksRepo } from "./priceChecks.js";
import { EmailLogRepo } from "./emailLog.js";
import { SettingsRepo } from "./settings.js";

let db: DB;
beforeEach(() => { db = openDb(":memory:"); migrate(db); });

describe("PriceChecksRepo", () => {
  it("records an attempt", () => {
    const items = new WasteItemsRepo(db);
    const id = items.create({ grocer: "kroger", capture_type: "barcode" }, "2026-06-07T00:00:00Z");
    const pc = new PriceChecksRepo(db);
    pc.record(id, "api", '{"ok":true}', true, "2026-06-07T00:00:01Z");
    expect(pc.listForItem(id).length).toBe(1);
  });
});

describe("EmailLogRepo", () => {
  it("records and finds a sent email for a period", () => {
    const repo = new EmailLogRepo(db);
    repo.record({ period_type: "weekly", period_start: "2026-06-01", period_end: "2026-06-08", total_cents: 4713, status: "sent" }, "2026-06-08T13:00:00Z");
    expect(repo.alreadySent("weekly", "2026-06-01")).toBe(true);
    expect(repo.alreadySent("weekly", "2026-06-08")).toBe(false);
  });
});

describe("SettingsRepo", () => {
  it("gets default and sets/reads a value", () => {
    const s = new SettingsRepo(db);
    expect(s.get("weekly_enabled", "true")).toBe("true");
    s.set("weekly_enabled", "false");
    expect(s.get("weekly_enabled", "true")).toBe("false");
  });
});
