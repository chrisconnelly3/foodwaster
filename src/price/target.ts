import type { PriceQuery, PriceResult } from "./types.js";
import type { Config } from "../config.js";

export function parseTargetSearch(json: any): PriceResult | null {
  const p = json?.data?.search?.products?.[0];
  const dollars = Number(p?.price?.current_retail);
  if (!isFinite(dollars) || dollars <= 0) return null;
  return { price_cents: Math.round(dollars * 100), source: "api", confidence: 0.7, raw: JSON.stringify(p) };
}

export async function targetPrice(q: PriceQuery, cfg: Config, fetchFn = fetch): Promise<PriceResult | null> {
  if (!cfg.target.storeId || !cfg.target.apiKey) return null;
  const kw = encodeURIComponent(q.identity.product_name);
  const url = `https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?keyword=${kw}&pricing_store_id=${cfg.target.storeId}&key=${cfg.target.apiKey}&count=1`;
  const res = await fetchFn(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return null;
  return parseTargetSearch(await res.json());
}
