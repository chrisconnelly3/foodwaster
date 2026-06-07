import type { FastifyInstance } from "fastify";
import type { WasteItemsRepo } from "../../db/repositories/wasteItems.js";
import { checkPasscode } from "../auth.js";
import { weekBounds, monthBounds } from "../../domain/periods.js";
import { totalCents, byCategory, byGrocer, repeatOffenders, projectedAnnualCents, weeklyTrend } from "../../domain/stats.js";

export interface LedgerDeps { items: WasteItemsRepo; passcode: string; tz: string; now: () => Date; }

export function registerLedgerRoutes(app: FastifyInstance, deps: LedgerDeps): void {
  app.get("/api/ledger", async (req, reply) => {
    if (!checkPasscode(deps.passcode, req.headers["x-passcode"] as string | undefined)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const now = deps.now();
    const wk = weekBounds(now, deps.tz);
    const mo = monthBounds(now, deps.tz);
    const onlyPriced = (xs: any[]) => xs.filter(i => i.price_cents != null);

    const weekItems = onlyPriced(deps.items.listBetween(wk.startIso, wk.endIso));
    const monthItems = onlyPriced(deps.items.listBetween(mo.startIso, mo.endIso));
    const allPriced = onlyPriced(deps.items.listRecent(1000));

    const weekTotal = totalCents(weekItems);
    const monthTotal = totalCents(monthItems);
    return reply.send({
      weekLabel: wk.label, monthLabel: mo.label,
      weekTotalCents: weekTotal,
      monthTotalCents: monthTotal,
      projectedAnnualCents: projectedAnnualCents(monthTotal, "monthly"),
      weeklyTrend: weeklyTrend(allPriced, deps.tz),
      byCategory: byCategory(monthItems),
      byGrocer: byGrocer(monthItems),
      repeatOffenders: repeatOffenders(allPriced).slice(0, 10),
      recent: deps.items.listRecent(50),
    });
  });
}
