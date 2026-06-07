import type { WasteItem } from "../types.js";
import type { WasteItemsRepo } from "../db/repositories/wasteItems.js";
import type { PriceChecksRepo } from "../db/repositories/priceChecks.js";
import type { IdentifyResult } from "../identify/types.js";
import type { PriceQuery, PriceResult } from "../price/types.js";

export interface WorkerDeps {
  items: WasteItemsRepo;
  checks: PriceChecksRepo;
  identify: (item: WasteItem) => Promise<IdentifyResult | null>;
  resolve: (q: PriceQuery) => Promise<PriceResult>;
  now: () => string;
}

export async function processItem(item: WasteItem, deps: WorkerDeps): Promise<void> {
  const identity = await deps.identify(item);
  if (!identity) {
    deps.checks.record(item.id, "identify", "null", false, deps.now());
    throw new Error("identify failed");
  }
  deps.items.setIdentity(item.id, {
    product_name: identity.product_name, brand: identity.brand, category: identity.category, confidence: identity.confidence,
  });
  const price = await deps.resolve({ grocer: item.grocer, barcode: item.barcode, identity });
  deps.checks.record(item.id, price.source, price.raw, true, deps.now());
  deps.items.setPrice(item.id, { price_cents: price.price_cents, price_source: price.source, status: "priced" });
}

export const MAX_ATTEMPTS = 3;

/** Decide retry vs give-up after a processing error. */
export function onProcessError(item: WasteItem, attempts: number, deps: Pick<WorkerDeps, "items">): "retry" | "failed" {
  if (attempts + 1 >= MAX_ATTEMPTS) { deps.items.setStatus(item.id, "failed"); return "failed"; }
  return "retry";
}
