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

export async function estimatePrice(q: PriceQuery, client: Anthropic): Promise<PriceResult | null> {
  const name = `${q.identity.brand ?? ""} ${q.identity.product_name}`.replace(/"/g, "'").trim();
  const prompt = `Estimate the current US retail price in dollars for "${name}" at ${GROCER_LABEL[q.grocer]}. Respond ONLY as JSON: {"price_usd": number}`;
  const msg = await client.messages.create({
    model: "claude-sonnet-4-5", max_tokens: 100,
    messages: [{ role: "user", content: prompt }],
  });
  const text = msg.content.filter(b => b.type === "text").map((b: any) => b.text).join("");
  return parseEstimate(text);
}
