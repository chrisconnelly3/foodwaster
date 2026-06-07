import type { PriceQuery, PriceResult } from "./types.js";
import type { Config } from "../config.js";

export function parseKrogerProducts(json: any): PriceResult | null {
  const first = json?.data?.[0];
  const price = first?.items?.[0]?.price;
  if (!price) return null;
  const regular = Number(price.regular);
  const promo = Number(price.promo);
  const dollars = promo > 0 && promo < regular ? promo : regular;
  if (!isFinite(dollars) || dollars <= 0) return null;
  return { price_cents: Math.round(dollars * 100), source: "api", confidence: 0.8, raw: JSON.stringify(first) };
}

async function getToken(cfg: Config, fetchFn = fetch): Promise<string> {
  const body = new URLSearchParams({ grant_type: "client_credentials", scope: "product.compact" });
  const auth = Buffer.from(`${cfg.kroger.clientId}:${cfg.kroger.clientSecret}`).toString("base64");
  const res = await fetchFn("https://api.kroger.com/v1/connect/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`kroger token ${res.status}`);
  return (await res.json()).access_token;
}

export async function krogerPrice(q: PriceQuery, cfg: Config, fetchFn = fetch): Promise<PriceResult | null> {
  if (!cfg.kroger.clientId || !cfg.kroger.locationId) return null;
  const token = await getToken(cfg, fetchFn);
  const term = encodeURIComponent(q.identity.product_name);
  const url = `https://api.kroger.com/v1/products?filter.term=${term}&filter.locationId=${cfg.kroger.locationId}&filter.limit=1`;
  const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!res.ok) return null;
  return parseKrogerProducts(await res.json());
}
