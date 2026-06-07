import { describe, it, expect, beforeEach } from "vitest";
import { openDb, migrate, DB } from "../db/connection.js";
import { WasteItemsRepo } from "../db/repositories/wasteItems.js";
import { JobQueue } from "./jobQueue.js";

let db: DB; let q: JobQueue; let items: WasteItemsRepo;
beforeEach(() => {
  db = openDb(":memory:"); migrate(db);
  items = new WasteItemsRepo(db);
  q = new JobQueue(db);
});

describe("JobQueue", () => {
  it("enqueues and claims a ready job", () => {
    const id = items.create({ grocer: "kroger", capture_type: "barcode" }, "2026-06-07T00:00:00Z");
    q.enqueue(id, "2026-06-07T00:00:00Z");
    const job = q.claimNext("2026-06-07T00:00:01Z")!;
    expect(job.item_id).toBe(id);
  });
  it("does not claim a job whose run_after is in the future", () => {
    const id = items.create({ grocer: "kroger", capture_type: "barcode" }, "2026-06-07T00:00:00Z");
    q.enqueue(id, "2026-06-07T00:00:10Z");
    expect(q.claimNext("2026-06-07T00:00:00Z")).toBeUndefined();
  });
  it("marks a job done so it is not re-claimed", () => {
    const id = items.create({ grocer: "kroger", capture_type: "barcode" }, "2026-06-07T00:00:00Z");
    q.enqueue(id, "2026-06-07T00:00:00Z");
    const job = q.claimNext("2026-06-07T00:00:01Z")!;
    q.complete(job.id);
    expect(q.claimNext("2026-06-07T00:00:02Z")).toBeUndefined();
  });
  it("reschedules with incremented attempts", () => {
    const id = items.create({ grocer: "kroger", capture_type: "barcode" }, "2026-06-07T00:00:00Z");
    q.enqueue(id, "2026-06-07T00:00:00Z");
    const job = q.claimNext("2026-06-07T00:00:01Z")!;
    q.retry(job.id, "2026-06-07T00:05:00Z");
    const again = q.claimNext("2026-06-07T00:06:00Z")!;
    expect(again.attempts).toBe(1);
  });
  it("does not re-claim a job that is already claimed (in-flight)", () => {
    const id = items.create({ grocer: "kroger", capture_type: "barcode" }, "2026-06-07T00:00:00Z");
    q.enqueue(id, "2026-06-07T00:00:00Z");
    const first = q.claimNext("2026-06-07T00:00:01Z")!;
    expect(first).toBeTruthy();
    expect(q.claimNext("2026-06-07T00:00:02Z")).toBeUndefined(); // still in-flight, not done, not retried
  });
});
