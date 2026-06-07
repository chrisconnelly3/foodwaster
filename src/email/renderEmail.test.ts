import { describe, it, expect } from "vitest";
import { renderEmailHtml } from "./renderEmail.js";
import type { EmailSummary } from "./summaryBuilder.js";
import type { EmailCopy } from "./copywriter.js";

const summary = {
  periodType: "weekly", periodLabel: "Jun 1 – Jun 7", periodStart: "2026-06-01", periodEnd: "2026-06-08",
  totalCents: 4713, itemCount: 6, projectedAnnualCents: 245076,
  byCategory: [{ category: "produce", cents: 4713 }],
  byGrocer: [{ grocer: "whole_foods", cents: 4713, pct: 100 }],
  worstGrocer: { grocer: "whole_foods", cents: 4713, pct: 100 },
  repeatOffenders: [{ name: "Blueberries", count: 3, cents: 1797 }],
  trend: [], photoPaths: [],
} as EmailSummary;
const copy: EmailCopy = { subject: "S", headline: "Money in the bin", body: "We wasted a lot.", tips: ["Buy less"] };

describe("renderEmailHtml", () => {
  it("includes headline, total, tips, and the chart cid", () => {
    const html = renderEmailHtml(summary, copy, "trend123");
    expect(html).toContain("Money in the bin");
    expect(html).toContain("$47.13");
    expect(html).toContain("Buy less");
    expect(html).toContain("cid:trend123");
    expect(html).toContain("Blueberries");
  });
});
