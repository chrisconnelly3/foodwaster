import type { FastifyInstance } from "fastify";
import type { WasteItemsRepo } from "../../db/repositories/wasteItems.js";
import type { Config } from "../../config.js";
import type { PriceQuery, PriceResult } from "../../price/types.js";
import { checkPasscode } from "../auth.js";
import { selectSource } from "../../price/selectSource.js";
import { cheapestAcross } from "../../price/compare.js";

export interface CheaperDeps {
  items: WasteItemsRepo; passcode: string; cfg: Config;
  estimate: (q: PriceQuery) => Promise<PriceResult | null>;
}

export function registerCheaperRoutes(app: FastifyInstance, deps: CheaperDeps): void {
  app.get<{ Params: { id: string } }>("/api/items/:id/cheaper", async (req, reply) => {
    if (!checkPasscode(deps.passcode, req.headers["x-passcode"] as string | undefined)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const item = deps.items.get(Number(req.params.id));
    if (!item || !item.product_name) return reply.code(404).send({ error: "not found or unidentified" });
    const identity = { product_name: item.product_name, brand: item.brand, category: item.category, confidence: item.confidence ?? 0.5 };
    const priceFor = (q: PriceQuery) => {
      const src = selectSource(q.grocer, deps.cfg);
      return src(q).then(r => r ?? deps.estimate(q));
    };
    try {
      const result = await cheapestAcross(identity, priceFor);
      return reply.send(result);
    } catch {
      return reply.code(502).send({ error: "could not price across grocers" });
    }
  });
}
