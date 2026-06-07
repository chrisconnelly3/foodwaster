import type { FastifyInstance } from "fastify";
import type { SettingsRepo } from "../../db/repositories/settings.js";
import { checkPasscode } from "../auth.js";

const KEYS = ["weekly_enabled", "monthly_enabled", "wife_email"] as const;

export function registerSettingsRoutes(app: FastifyInstance, deps: { settings: SettingsRepo; passcode: string }): void {
  app.get("/api/settings", async (req, reply) => {
    if (!checkPasscode(deps.passcode, req.headers["x-passcode"] as string | undefined)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const out: Record<string, string> = {};
    for (const k of KEYS) out[k] = deps.settings.get(k, k === "wife_email" ? "" : "true");
    return reply.send(out);
  });

  app.put("/api/settings", async (req, reply) => {
    if (!checkPasscode(deps.passcode, req.headers["x-passcode"] as string | undefined)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = (req.body ?? {}) as Record<string, string>;
    for (const k of KEYS) if (k in body) deps.settings.set(k, String(body[k]));
    return reply.send({ ok: true });
  });
}
