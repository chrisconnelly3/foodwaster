import { describe, it, expect } from "vitest";
import { renderEmailHtml } from "./renderEmail.js";
import type { EmailSummary } from "./summaryBuilder.js";
import type { EmailCopy } from "./copywriter.js";

const summary = {
  periodType: "monthly", periodLabel: "Jun 2026", periodStart: "2026-06-01", periodEnd: "2026-07-01",
  totalCents: 4713, itemCount: 6, projectedAnnualCents: 245076,
  byCategory: [{ category: "produce", cents: 4713 }],
  byGrocer: [{ grocer: "whole_foods", cents: 4713, pct: 100 }],
  worstGrocer: { grocer: "whole_foods", cents: 4713, pct: 100 },
  repeatOffenders: [{ name: "Blueberries", count: 3, cents: 1797 }],
  items: [{ name: "Organic Heavy Cream", grocer: "whole_foods", qty: 1, cents: 899 }],
  trend: [{ weekStart: "2026-06-01", label: "Jun 1", cents: 4713 }], photoPaths: [],
} as EmailSummary;
const copy: EmailCopy = { subject: "S", headline: "Money in the bin", body: "We wasted a lot.", tips: ["Buy less"] };

describe("renderEmailHtml", () => {
  it("includes headline, total, projection, worst store, offenders, and tips", () => {
    const html = renderEmailHtml(summary, copy);
    expect(html).toContain("Money in the bin");
    expect(html).toContain("$47.13");
    expect(html).toContain("$2,450.76");
    expect(html).toContain("Buy less");
    expect(html).toContain("Whole Foods");
    expect(html).toContain("Blueberries");
  });
  it("embeds the trend chart as an inline hosted image, not a cid attachment", () => {
    const html = renderEmailHtml(summary, copy);
    expect(html).toContain("https://quickchart.io/chart");
    expect(html).not.toContain("cid:");
  });
  it("omits the chart block when there is no trend data", () => {
    const html = renderEmailHtml({ ...summary, trend: [] } as EmailSummary, copy);
    expect(html).not.toContain("quickchart.io");
  });
  it("lists each wasted item with its price plus a total", () => {
    const html = renderEmailHtml(summary, copy);
    expect(html).toContain("The full tab");
    expect(html).toContain("Organic Heavy Cream");
    expect(html).toContain("$8.99");
    expect(html).toContain("Total wasted");
  });
});
