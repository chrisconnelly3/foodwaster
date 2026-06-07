import Anthropic from "@anthropic-ai/sdk";
import type { IdentifyResult } from "./types.js";

const ALLOWED = ["produce","dairy","meat","bakery","pantry","frozen","beverage","other"];

export function parseVisionJson(text: string): IdentifyResult | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let obj: any;
  try { obj = JSON.parse(match[0]); } catch { return null; }
  if (!obj.product_name) return null;
  const conf = Math.max(0, Math.min(1, Number(obj.confidence ?? 0.5)));
  const category = ALLOWED.includes(obj.category) ? obj.category : "other";
  return { product_name: String(obj.product_name), brand: obj.brand ?? null, category, confidence: conf };
}

const PROMPT = `Identify the single grocery product in this image. Respond ONLY with JSON:
{"product_name": string, "brand": string|null, "category": one of ["produce","dairy","meat","bakery","pantry","frozen","beverage","other"], "confidence": 0..1}`;

export async function identifyPhoto(base64: string, mediaType: string, client: Anthropic): Promise<IdentifyResult | null> {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 300,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mediaType as any, data: base64 } },
      { type: "text", text: PROMPT },
    ]}],
  });
  const text = msg.content.filter(b => b.type === "text").map((b: any) => b.text).join("");
  return parseVisionJson(text);
}
