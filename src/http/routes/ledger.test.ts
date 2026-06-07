import { describe, it, expect, beforeEach } from "vitest";
import { openDb, migrate, DB } from "../../db/connection.js";
import { WasteItemsRepo } from "../../db/repositories/wasteItems.js";
import Fastify from "fastify";
import { registerLedgerRoutes } from "./ledger.js";

let db: DB; let items: WasteItemsRepo;
function buildApp() {
  const app = Fastify();
  registerLedgerRoutes(app, { items, passcode: "secret", tz: "UTC", now: () => new Date("2026-06-07T00:00:00Z") });
  return app;
}
beforeEach(() => { db = openDb(":memory:"); migrate(db); items = new WasteItemsRepo(db); });

describe("GET /api/ledger", () => {
  it("returns aggregate dashboard data for priced items", async () => {
    const id = items.create({ grocer: "whole_foods", capture_type: "barcode" }, "2026-06-02T00:00:00Z");
    items.setIdentity(id, { product_name: "Blueberries", brand: null, category: "produce", confidence: 1 });
    items.setPrice(id, { price_cents: 599, price_source: "api", status: "priced" });

    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/ledger", headers: { "x-passcode": "secret" } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.weekTotalCents).toBe(599);
    expect(body.monthTotalCents).toBe(599);
    expect(body.byCategory[0].category).toBe("produce");
    expect(body.projectedAnnualCents).toBe(599 * 12);
  });
});
