import { describe, it, expect, beforeEach } from "vitest";
import { openDb, migrate, DB } from "../connection.js";
import { WasteItemsRepo } from "./wasteItems.js";

let db: DB; let repo: WasteItemsRepo;
beforeEach(() => { db = openDb(":memory:"); migrate(db); repo = new WasteItemsRepo(db); });

describe("WasteItemsRepo", () => {
  it("inserts a pending item and reads it back", () => {
    const id = repo.create({ grocer: "whole_foods", capture_type: "barcode", barcode: "012", qty: 1 }, "2026-06-07T12:00:00Z");
    const item = repo.get(id)!;
    expect(item.status).toBe("pending");
    expect(item.grocer).toBe("whole_foods");
    expect(item.barcode).toBe("012");
  });

  it("updates identity and price", () => {
    const id = repo.create({ grocer: "kroger", capture_type: "photo" }, "2026-06-07T12:00:00Z");
    repo.setIdentity(id, { product_name: "Blueberries", brand: "Acme", category: "produce", confidence: 0.9 });
    repo.setPrice(id, { price_cents: 599, price_source: "api", status: "priced" });
    const item = repo.get(id)!;
    expect(item.product_name).toBe("Blueberries");
    expect(item.price_cents).toBe(599);
    expect(item.status).toBe("priced");
  });

  it("lists pending items", () => {
    repo.create({ grocer: "target", capture_type: "barcode" }, "2026-06-07T12:00:00Z");
    expect(repo.listPending().length).toBe(1);
  });

  it("lists items within a date range", () => {
    repo.create({ grocer: "target", capture_type: "barcode" }, "2026-06-01T12:00:00Z");
    repo.create({ grocer: "target", capture_type: "barcode" }, "2026-06-09T12:00:00Z");
    const inRange = repo.listBetween("2026-06-05T00:00:00Z", "2026-06-12T00:00:00Z");
    expect(inRange.length).toBe(1);
  });

  it("delete removes the item and its dependent price_check + job rows", () => {
    const id = repo.create({ grocer: "kroger", capture_type: "barcode" }, "2026-06-08T00:00:00Z");
    db.prepare("INSERT INTO price_check (item_id, source, raw_result, success, ran_at) VALUES (?,?,?,?,?)")
      .run(id, "api", "{}", 1, "2026-06-08T00:00:01Z");
    db.prepare("INSERT INTO job (item_id, run_after) VALUES (?,?)").run(id, "2026-06-08T00:00:00Z");

    expect(repo.delete(id)).toBe(true);
    expect(repo.get(id)).toBeUndefined();
    expect((db.prepare("SELECT COUNT(*) c FROM price_check WHERE item_id=?").get(id) as any).c).toBe(0);
    expect((db.prepare("SELECT COUNT(*) c FROM job WHERE item_id=?").get(id) as any).c).toBe(0);
  });

  it("delete returns false when the item does not exist", () => {
    expect(repo.delete(999)).toBe(false);
  });
});
