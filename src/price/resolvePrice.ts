import type { PriceQuery, PriceResult } from "./types.js";

export interface ResolveDeps {
  source: (q: PriceQuery) => Promise<PriceResult | null>; // grocer-specific
  estimate: (q: PriceQuery) => Promise<PriceResult | null>;
}

export async function resolvePrice(q: PriceQuery, deps: ResolveDeps): Promise<PriceResult> {
  let viaSource: PriceResult | null = null;
  try { viaSource = await deps.source(q); } catch { viaSource = null; }
  if (viaSource) return viaSource;
  const viaEstimate = await deps.estimate(q);
  if (viaEstimate) return viaEstimate;
  throw new Error("price unresolved");
}
