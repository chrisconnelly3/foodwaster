import { chromium } from "playwright";
import type { PriceQuery, PriceResult } from "./types.js";
import type { Config } from "../config.js";

export function parsePriceString(whole: string, fraction?: string): number | null {
  if (fraction !== undefined) {
    const w = whole.replace(/[^0-9]/g, "");
    const f = fraction.replace(/[^0-9]/g, "").padEnd(2, "0").slice(0, 2);
    if (!w) return null;
    return parseInt(w, 10) * 100 + parseInt(f, 10);
  }
  const m = whole.match(/\$\s*(\d+)\.(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
}

export async function wholeFoodsPrice(q: PriceQuery, cfg: Config): Promise<PriceResult | null> {
  const term = encodeURIComponent(`${q.identity.brand ?? ""} ${q.identity.product_name}`.trim());
  const url = `https://www.amazon.com/s?k=${term}&i=wholefoods`;
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ userAgent: "Mozilla/5.0", locale: "en-US" });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    const whole = await page.locator(".a-price .a-price-whole").first().textContent({ timeout: 5000 }).catch(() => null);
    const frac = await page.locator(".a-price .a-price-fraction").first().textContent({ timeout: 5000 }).catch(() => null);
    if (!whole) return null;
    const cents = parsePriceString(whole, frac ?? "00");
    if (cents === null) return null;
    return { price_cents: cents, source: "scrape", confidence: 0.6, raw: `${whole}.${frac ?? "00"}` };
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}
