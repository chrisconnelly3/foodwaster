import type { PriceQuery, PriceResult } from "./types.js";

export interface ResolveDeps {
  source: (q: PriceQuery) => Promise<PriceResult | null>; // grocer-specific
  estimate: (q: PriceQuery) => Promise<PriceResult | null>;
}

export async function resolvePrice(q: PriceQuery, deps: ResolveDeps): Promise<PriceResult> {
  let viaSource: PriceResult | null = null;
  let sourceError: unknown;
  try { viaSource = await deps.source(q); } catch (err) { sourceError = err; }
  if (viaSource) return viaSource;
  const viaEstimate = await deps.estimate(q);
  if (viaEstimate) return viaEstimate;
  throw sourceError ?? new Error("price unresolved");
}
