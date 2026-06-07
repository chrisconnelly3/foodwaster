import { describe, it, expect, beforeEach } from "vitest";
import { openDb, migrate, DB } from "../../db/connection.js";
import { WasteItemsRepo } from "../../db/repositories/wasteItems.js";
import { SettingsRepo } from "../../db/repositories/settings.js";
import Fastify from "fastify";
import { registerItemRoutes } from "./items.js";
import { registerSettingsRoutes } from "./settings.js";

let db: DB; let items: WasteItemsRepo; let settings: SettingsRepo;
function buildApp() {
  const app = Fastify();
  registerItemRoutes(app, { items, passcode: "secret" });
  registerSettingsRoutes(app, { settings, passcode: "secret" });
  return app;
}
beforeEach(() => { db = openDb(":memory:"); migrate(db); items = new WasteItemsRepo(db); settings = new SettingsRepo(db); });

describe("PATCH /api/items/:id", () => {
  it("overrides price and marks it manual", async () => {
    const id = items.create({ grocer: "kroger", capture_type: "barcode" }, "2026-06-07T00:00:00Z");
    const app = buildApp();
    const res = await app.inject({
      method: "PATCH", url: `/api/items/${id}`,
      headers: { "x-passcode": "secret" },
      payload: { priceDollars: "7.25" },
    });
    expect(res.statusCode).toBe(200);
    const item = items.get(id)!;
    expect(item.price_cents).toBe(725);
    expect(item.price_source).toBe("manual");
    expect(item.status).toBe("manual");
  });
});

describe("settings routes", () => {
  it("reads and writes settings", async () => {
    const app = buildApp();
    await app.inject({ method: "PUT", url: "/api/settings", headers: { "x-passcode": "secret" }, payload: { weekly_enabled: "false" } });
    const res = await app.inject({ method: "GET", url: "/api/settings", headers: { "x-passcode": "secret" } });
    expect(res.json().weekly_enabled).toBe("false");
  });
});
