import type { Grocer } from "../types.js";
import type { Config } from "../config.js";
import type { PriceQuery, PriceResult } from "./types.js";
import { krogerPrice } from "./kroger.js";
import { targetPrice } from "./target.js";
import { wholeFoodsPrice } from "./wholeFoods.js";

interface Mods {
  krogerPrice: typeof krogerPrice; targetPrice: typeof targetPrice; wholeFoodsPrice: typeof wholeFoodsPrice;
}
const defaultMods: Mods = { krogerPrice, targetPrice, wholeFoodsPrice };

export function selectSource(grocer: Grocer, cfg: Config, mods: Mods = defaultMods) {
  return (q: PriceQuery): Promise<PriceResult | null> => {
    if (grocer === "kroger") return mods.krogerPrice(q, cfg);
    if (grocer === "target") return mods.targetPrice(q, cfg);
    if (grocer === "whole_foods") {
      // The Whole Foods Playwright scrape hangs/OOMs on small hosts. Off by default →
      // null here makes resolvePrice fall back to the AI estimate. Enable via WHOLE_FOODS_SCRAPE=true.
      if (!cfg.wholeFoods.scrape) return Promise.resolve(null);
      return mods.wholeFoodsPrice(q, cfg);
    }
    throw new Error(`unknown grocer: ${grocer}`);
  };
}
