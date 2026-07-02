import { describe, it, expect, beforeEach, vi } from "vitest";
import { openDb, migrate, DB } from "../../db/connection.js";
import Fastify from "fastify";
import { registerEmailRoutes } from "./email.js";

let db: DB;
beforeEach(() => { db = openDb(":memory:"); migrate(db); });

function buildApp(sendReport: any) {
  const app = Fastify();
  registerEmailRoutes(app, { passcode: "secret", sendReport, now: () => new Date("2026-07-02T00:00:00Z") } as any);
  return app;
}

describe("POST /api/email/test", () => {
  it("rejects without passcode", async () => {
    const sendReport = vi.fn();
    const res = await buildApp(sendReport).inject({ method: "POST", url: "/api/email/test" });
    expect(res.statusCode).toBe(401);
    expect(sendReport).not.toHaveBeenCalled();
  });

  it("sends the current month as a test send by default", async () => {
    const sendReport = vi.fn().mockResolvedValue({ status: "sent" });
    const res = await buildApp(sendReport).inject({ method: "POST", url: "/api/email/test", headers: { "x-passcode": "secret" } });
    expect(res.statusCode).toBe(200);
    expect(sendReport).toHaveBeenCalledWith("monthly", expect.any(Date), expect.objectContaining({ markTest: true }));
  });

  it("honors an explicit month + recipient override", async () => {
    const sendReport = vi.fn().mockResolvedValue({ status: "sent" });
    const res = await buildApp(sendReport).inject({
      method: "POST", url: "/api/email/test",
      headers: { "x-passcode": "secret", "content-type": "application/json" },
      payload: JSON.stringify({ to: "wife@example.com", month: "2026-06" }),
    });
    expect(res.statusCode).toBe(200);
    const [period, date, opts] = sendReport.mock.calls[0];
    expect(period).toBe("monthly");
    expect((date as Date).toISOString()).toBe("2026-06-15T12:00:00.000Z");
    expect(opts).toEqual({ toOverride: "wife@example.com", markTest: true });
  });

  it("400s on a malformed month", async () => {
    const sendReport = vi.fn();
    const res = await buildApp(sendReport).inject({
      method: "POST", url: "/api/email/test",
      headers: { "x-passcode": "secret", "content-type": "application/json" },
      payload: JSON.stringify({ month: "nope" }),
    });
    expect(res.statusCode).toBe(400);
    expect(sendReport).not.toHaveBeenCalled();
  });
});
