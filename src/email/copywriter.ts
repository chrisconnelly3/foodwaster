import Anthropic from "@anthropic-ai/sdk";
import type { EmailSummary } from "./summaryBuilder.js";
import { formatCents } from "../domain/money.js";

export interface EmailCopy { subject: string; headline: string; body: string; tips: string[]; }

const GROCER_LABEL = { whole_foods: "Whole Foods", kroger: "Kroger", target: "Target" } as const;

export function buildCopyPrompt(s: EmailSummary): string {
  const offenders = s.repeatOffenders.map(o => `${o.name} (${o.count}×, ${formatCents(o.cents)})`).join(", ") || "none";
  return `Write a short household "food waste report" email to my wife. Tone: guilt-trippy, mildly critical and condescending, but not cruel — playful spouse-to-spouse jab. Keep it punchy.

Data for ${s.periodLabel} (${s.periodType}):
- Total thrown away: ${formatCents(s.totalCents)} across ${s.itemCount} items
- Projected at this rate per year: ${formatCents(s.projectedAnnualCents)}
- Worst store: ${GROCER_LABEL[s.worstGrocer.grocer]} (${Math.round(s.worstGrocer.pct)}%)
- Repeat offenders: ${offenders}

Respond ONLY as JSON:
{"subject": string, "headline": string, "body": string (2-4 sentences), "tips": string[] (2-3 actionable, slightly smug tips)}`;
}

export function fallbackCopy(s: EmailSummary): EmailCopy {
  const total = formatCents(s.totalCents);
  return {
    subject: `Your food waste this ${s.periodType === "weekly" ? "week" : "month"}: ${total}`,
    headline: `${total} straight into the trash.`,
    body: `This ${s.periodType === "weekly" ? "week" : "month"} we threw away ${total} of food across ${s.itemCount} items. At this rate that's ${formatCents(s.projectedAnnualCents)} a year. ${GROCER_LABEL[s.worstGrocer.grocer]} did the most damage.`,
    tips: [
      "Buy half as much of anything perishable — you can always go back.",
      "If it's not getting eaten in 3 days, it doesn't go in the cart.",
      s.repeatOffenders[0] ? `Maybe stop buying ${s.repeatOffenders[0].name} until we finish a batch.` : "Check the fridge before shopping.",
    ].filter(Boolean),
  };
}

function parseCopy(text: string): EmailCopy | null {
  const m = text.match(/\{[\s\S]*\}/); if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (!o.subject || !o.headline || !o.body || !Array.isArray(o.tips)) return null;
    return { subject: o.subject, headline: o.headline, body: o.body, tips: o.tips.map(String) };
  } catch { return null; }
}

export async function generateCopy(s: EmailSummary, client: Anthropic): Promise<EmailCopy> {
  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-5", max_tokens: 600,
      messages: [{ role: "user", content: buildCopyPrompt(s) }],
    });
    const text = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    return parseCopy(text) ?? fallbackCopy(s);
  } catch {
    return fallbackCopy(s);
  }
}
