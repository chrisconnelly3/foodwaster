import type { FastifyInstance } from "fastify";
import { checkPasscode } from "../auth.js";

export interface EmailRouteDeps {
  passcode: string;
  sendReport: (periodType: "weekly" | "monthly", now: Date) => Promise<{ status: "sent" | "failed" }>;
  now: () => Date;
}

export function registerEmailRoutes(app: FastifyInstance, deps: EmailRouteDeps): void {
  app.post("/api/email/test", async (req, reply) => {
    if (!checkPasscode(deps.passcode, req.headers["x-passcode"] as string | undefined)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const result = await deps.sendReport("weekly", deps.now());
    return reply.send(result);
  });
}
