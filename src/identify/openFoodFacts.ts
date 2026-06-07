import type { IdentifyResult } from "./types.js";

const CATEGORY_MAP: [string, string][] = [
  ["dairy", "dairy"], ["milk", "dairy"], ["cheese", "dairy"], ["yogurt", "dairy"],
  ["meat", "meat"], ["beef", "meat"], ["poultry", "meat"], ["fish", "meat"], ["seafood", "meat"],
  ["fruit", "produce"], ["vegetable", "produce"], ["produce", "produce"],
  ["bread", "bakery"], ["baker", "bakery"],
  ["frozen", "frozen"],
  ["beverage", "beverage"], ["drink", "beverage"], ["juice", "beverage"],
];

export function mapOffCategory(tags: string[]): string {
  const joined = tags.join(" ").toLowerCase();
  for (const [needle, cat] of CATEGORY_MAP) if (joined.includes(needle)) return cat;
  return "other";
}

export function parseOffResponse(json: any): IdentifyResult | null {
  if (!json || json.status !== 1 || !json.product) return null;
  const p = json.product;
  const name = (p.product_name ?? "").trim();
  if (!name) return null;
  return {
    product_name: name,
    brand: p.brands ? String(p.brands).split(",")[0].trim() : null,
    category: mapOffCategory(p.categories_tags ?? []),
    confidence: 0.85,
  };
}

export async function lookupBarcode(barcode: string, fetchFn = fetch): Promise<IdentifyResult | null> {
  const res = await fetchFn(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
  if (!res.ok) return null;
  return parseOffResponse(await res.json());
}
