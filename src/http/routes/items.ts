import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { WasteItemsRepo } from "../../db/repositories/wasteItems.js";
import { checkPasscode } from "../auth.js";
import { dollarsToCents } from "../../domain/money.js";

const patchSchema = z.object({
  priceDollars: z.string().optional(),
  product_name: z.string().optional(),
  category: z.string().optional(),
  qty: z.number().int().positive().optional(),
});

export function registerItemRoutes(app: FastifyInstance, deps: { items: WasteItemsRepo; passcode: string }): void {
  app.patch<{ Params: { id: string } }>("/api/items/:id", async (req, reply) => {
    if (!checkPasscode(deps.passcode, req.headers["x-passcode"] as string | undefined)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const id = Number(req.params.id);
    const item = deps.items.get(id);
    if (!item) return reply.code(404).send({ error: "not found" });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const p = parsed.data;
    if (p.priceDollars !== undefined) {
      deps.items.setPrice(id, { price_cents: dollarsToCents(p.priceDollars), price_source: "manual", status: "manual" });
    }
    if (p.product_name !== undefined || p.category !== undefined) {
      deps.items.setIdentity(id, {
        product_name: p.product_name ?? item.product_name ?? "Unknown",
        brand: item.brand, category: p.category ?? item.category, confidence: 1,
      });
    }
    return reply.send(deps.items.get(id));
  });
}
