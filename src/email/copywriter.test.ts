import { describe, it, expect, vi } from "vitest";
import { buildCopyPrompt, fallbackCopy, generateCopy } from "./copywriter.js";
import type { EmailSummary } from "./summaryBuilder.js";

const summary: EmailSummary = {
  periodType: "weekly", periodLabel: "Jun 1 – Jun 7", periodStart: "2026-06-01", periodEnd: "2026-06-08",
  totalCents: 4713, itemCount: 6, projectedAnnualCents: 4713 * 52,
  byCategory: [{ category: "produce", cents: 4713 }],
  byGrocer: [{ grocer: "whole_foods", cents: 4713, pct: 100 }],
  worstGrocer: { grocer: "whole_foods", cents: 4713, pct: 100 },
  repeatOffenders: [{ name: "Blueberries", count: 3, cents: 1797 }],
  trend: [], photoPaths: [],
};

describe("copywriter", () => {
  it("includes the dollar total and offender in the prompt", () => {
    const p = buildCopyPrompt(summary);
    expect(p).toContain("$47.13");
    expect(p).toContain("Blueberries");
  });
  it("fallback copy is non-empty and contains the total", () => {
    const c = fallbackCopy(summary);
    expect(c.subject).toContain("$47.13");
    expect(c.headline.length).toBeGreaterThan(0);
    expect(c.tips.length).toBeGreaterThanOrEqual(1);
  });
  it("generateCopy uses the model and parses its JSON", async () => {
    const client = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: "text", text: '{"subject":"S","headline":"H","body":"B","tips":["t1","t2"]}' }] }) } };
    const c = await generateCopy(summary, client as any);
    expect(c.subject).toBe("S");
    expect(c.tips).toHaveLength(2);
  });
  it("generateCopy falls back when the model output is unparseable", async () => {
    const client = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "garbage" }] }) } };
    const c = await generateCopy(summary, client as any);
    expect(c.subject).toContain("$47.13");
  });
});
