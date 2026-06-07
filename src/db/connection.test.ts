import { describe, it, expect } from "vitest";
import { openDb, migrate } from "./connection.js";

describe("db connection", () => {
  it("migrates an in-memory db and exposes tables", () => {
    const db = openDb(":memory:");
    migrate(db);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map((r: any) => r.name);
    expect(tables).toContain("waste_item");
    expect(tables).toContain("price_check");
    expect(tables).toContain("email_log");
    expect(tables).toContain("job");
    expect(tables).toContain("settings");
  });
});
