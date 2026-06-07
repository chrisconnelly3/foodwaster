import type { Grocer } from "../types.js";
import type { IdentifyResult } from "../identify/types.js";

export interface PriceQuery {
  grocer: Grocer;
  barcode: string | null;
  identity: IdentifyResult;
}

export interface PriceResult {
  price_cents: number;
  source: "scrape" | "api" | "ai_estimate";
  confidence: number; // 0..1
  raw: string;        // for price_check audit
}

export interface PriceSourceFn {
  (q: PriceQuery): Promise<PriceResult | null>;
}
