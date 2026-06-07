import { describe, it, expect, beforeEach } from "vitest";
import { openDb, migrate, DB } from "../../db/connection.js";
import { WasteItemsRepo } from "../../db/repositories/wasteItems.js";
import { JobQueue } from "../../queue/jobQueue.js";
import Fastify from "fastify";
import { registerCaptureRoutes } from "./captures.js";

let db: DB; let items: WasteItemsRepo; let q: JobQueue;
function buildApp() {
  const app = Fastify();
  items = new WasteItemsRepo(db); q = new JobQueue(db);
  registerCaptureRoutes(app, { items, queue: q, dataDir: "./data-test", passcode: "secret", now: () => "2026-06-07T00:00:00Z" });
  return app;
}
beforeEach(() => { db = openDb(":memory:"); migrate(db); });

describe("POST /api/captures", () => {
  it("rejects without passcode", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/api/captures", payload: { grocer: "kroger", capture_type: "barcode", barcode: "012" } });
    expect(res.statusCode).toBe(401);
  });

  it("creates a pending barcode item and enqueues a job", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST", url: "/api/captures",
      headers: { "x-passcode": "secret" },
      payload: { grocer: "kroger", capture_type: "barcode", barcode: "012" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe("pending");
    expect(items.get(body.id)!.barcode).toBe("012");
    expect(q.pendingCount()).toBe(1);
  });
});
