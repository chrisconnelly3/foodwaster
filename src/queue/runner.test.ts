import { describe, it, expect, beforeEach, vi } from "vitest";
import { openDb, migrate, DB } from "../db/connection.js";
import { WasteItemsRepo } from "../db/repositories/wasteItems.js";
import { JobQueue } from "./jobQueue.js";
import { runOnce } from "./runner.js";

let db: DB; let items: WasteItemsRepo; let q: JobQueue;
beforeEach(() => { db = openDb(":memory:"); migrate(db); items = new WasteItemsRepo(db); q = new JobQueue(db); });

describe("runOnce", () => {
  it("claims a ready job, processes it, and completes it", async () => {
    const id = items.create({ grocer: "kroger", capture_type: "barcode", barcode: "012" }, "2026-06-07T00:00:00Z");
    q.enqueue(id, "2026-06-07T00:00:00Z");
    const process = vi.fn().mockResolvedValue(undefined);
    const handled = await runOnce(q, items, process, () => "2026-06-07T00:00:05Z");
    expect(handled).toBe(true);
    expect(process).toHaveBeenCalled();
    expect(q.pendingCount()).toBe(0);
  });

  it("retries the job with backoff when processing throws", async () => {
    const id = items.create({ grocer: "kroger", capture_type: "barcode", barcode: "012" }, "2026-06-07T00:00:00Z");
    q.enqueue(id, "2026-06-07T00:00:00Z");
    const process = vi.fn().mockRejectedValue(new Error("x"));
    await runOnce(q, items, process, () => "2026-06-07T00:00:05Z");
    expect(q.pendingCount()).toBe(1); // re-scheduled, not done
  });

  it("returns false when nothing is ready", async () => {
    const handled = await runOnce(q, items, vi.fn(), () => "2026-06-07T00:00:05Z");
    expect(handled).toBe(false);
  });
});
