import type { FastifyInstance } from "fastify";
import { checkPasscode } from "../auth.js";

export interface EmailRouteDeps {
  passcode: string;
  sendReport: (
    periodType: "weekly" | "monthly",
    now: Date,
    opts?: { toOverride?: string; markTest?: boolean },
  ) => Promise<{ status: string }>;
  now: () => Date;
}

export function registerEmailRoutes(app: FastifyInstance, deps: EmailRouteDeps): void {
  // Preview / manual send. Body (all optional):
  //   { "to": "someone@x.com", "month": "2026-06" }
  // month=YYYY-MM sends that month's window (default: current month). Always recorded as a
  // "test" so it never blocks the real scheduled monthly send.
  app.post("/api/email/test", async (req, reply) => {
    if (!checkPasscode(deps.passcode, req.headers["x-passcode"] as string | undefined)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = (req.body ?? {}) as { to?: string; month?: string };
    const refDate = body.month ? new Date(`${body.month}-15T12:00:00Z`) : deps.now();
    if (isNaN(refDate.getTime())) return reply.code(400).send({ error: "invalid month (use YYYY-MM)" });
    const result = await deps.sendReport("monthly", refDate, { toOverride: body.to, markTest: true });
    return reply.send(result);
  });
}
