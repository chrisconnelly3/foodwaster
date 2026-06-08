import Anthropic from "@anthropic-ai/sdk";
import type { PriceQuery, PriceResult } from "./types.js";
import { GROCER_LABEL } from "../domain/grocers.js";

export function parseEstimate(text: string): PriceResult | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let obj: any;
  try { obj = JSON.parse(match[0]); } catch { return null; }
  const usd = Number(obj.price_usd);
  if (!isFinite(usd) || usd <= 0) return null;
  return { price_cents: Math.round(usd * 100), source: "ai_estimate", confidence: 0.4, raw: match[0] };
}

// Per-grocer pricing context so estimates reflect each store's real price level —
// Whole Foods especially runs premium, which is the whole point of this app.
const GROCER_PRICING_CONTEXT: Record<PriceQuery["grocer"], string> = {
  whole_foods:
    "Whole Foods Market is a premium, mostly-organic grocer; shelf prices run noticeably higher than mainstream supermarkets (commonly 20-40% more). Assume the organic / premium version of the item and lean toward the higher end of the plausible range.",
  kroger: "Kroger is a mainstream supermarket with roughly average US grocery pricing.",
  target: "Target grocery prices are competitive — about average, sometimes slightly below mainstream supermarkets.",
};

export function buildEstimatePrompt(q: PriceQuery): string {
  const name = `${q.identity.brand ?? ""} ${q.identity.product_name}`.replace(/"/g, "'").trim();
  return `You are estimating US grocery prices. ${GROCER_PRICING_CONTEXT[q.grocer]}
Estimate the current regular shelf price (NOT a sale/clearance price) in US dollars for "${name}" at ${GROCER_LABEL[q.grocer]}.
Respond ONLY as JSON: {"price_usd": number}`;
}

export async function estimatePrice(q: PriceQuery, client: Anthropic): Promise<PriceResult | null> {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-5", max_tokens: 100,
    messages: [{ role: "user", content: buildEstimatePrompt(q) }],
  });
  const text = msg.content.filter(b => b.type === "text").map((b: any) => b.text).join("");
  return parseEstimate(text);
}
