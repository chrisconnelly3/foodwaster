import type { Grocer } from "../types.js";
import type { IdentifyResult } from "../identify/types.js";
import type { PriceQuery, PriceResult } from "./types.js";

const ALL_GROCERS: Grocer[] = ["whole_foods", "kroger", "target"];

export interface CompareEntry { grocer: Grocer; price_cents: number; source: PriceResult["source"]; }
export interface CompareResult { cheapest: CompareEntry; all: CompareEntry[]; }

export async function cheapestAcross(
  identity: IdentifyResult,
  priceFor: (q: PriceQuery) => Promise<PriceResult | null>,
): Promise<CompareResult> {
  const results = await Promise.all(ALL_GROCERS.map(async (grocer): Promise<CompareEntry | null> => {
    try {
      const r = await priceFor({ grocer, barcode: null, identity });
      return r ? { grocer, price_cents: r.price_cents, source: r.source } : null;
    } catch { return null; }
  }));
  const all = results.filter((x): x is CompareEntry => x !== null);
  if (all.length === 0) throw new Error("no prices found");
  const cheapest = all.reduce((a, b) => (b.price_cents < a.price_cents ? b : a));
  return { cheapest, all };
}
