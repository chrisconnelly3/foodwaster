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
  // redsky requires visitor_id (NonNull) plus channel/page/platform, else it 400s.
  const params = new URLSearchParams({
    keyword: q.identity.product_name,
    pricing_store_id: cfg.target.storeId,
    key: cfg.target.apiKey,
    count: "1",
    channel: "WEB",
    platform: "desktop",
    visitor_id: "0123456789ABCDEF0123456789ABCDEF",
    page: `/s/${kw}`,
  });
  const url = `https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?${params.toString()}`;
  const res = await fetchFn(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
  if (!res.ok) return null;
  return parseTargetSearch(await res.json());
}
