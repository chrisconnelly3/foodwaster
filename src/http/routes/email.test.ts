import { describe, it, expect, beforeEach, vi } from "vitest";
import { openDb, migrate, DB } from "../../db/connection.js";
import Fastify from "fastify";
import { registerEmailRoutes } from "./email.js";

let db: DB;
beforeEach(() => { db = openDb(":memory:"); migrate(db); });

describe("POST /api/email/test", () => {
  it("invokes the report sender for the current week", async () => {
    const sendReport = vi.fn().mockResolvedValue({ status: "sent" });
    const app = Fastify();
    registerEmailRoutes(app, { passcode: "secret", sendReport, now: () => new Date("2026-06-07T00:00:00Z") } as any);
    const res = await app.inject({ method: "POST", url: "/api/email/test", headers: { "x-passcode": "secret" } });
    expect(res.statusCode).toBe(200);
    expect(sendReport).toHaveBeenCalledWith("weekly", expect.any(Date));
  });
});
