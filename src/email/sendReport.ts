import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import type { WasteItemsRepo } from "../db/repositories/wasteItems.js";
import type { EmailLogRepo } from "../db/repositories/emailLog.js";
import { weekBounds, monthBounds } from "../domain/periods.js";
import { buildSummary } from "./summaryBuilder.js";
import { generateCopy } from "./copywriter.js";
import { renderEmailHtml } from "./renderEmail.js";
import { sendSummaryEmail } from "./sender.js";

export interface SendReportDeps {
  items: WasteItemsRepo; emailLog: EmailLogRepo; anthropic: Anthropic; resend: Resend;
  from: string; to: string | (() => string); tz: string;
}

export interface SendReportOpts {
  toOverride?: string; // send to this address instead of the configured recipient
  markTest?: boolean;  // record as a "test" (does not count toward the cron's de-dup)
}

export type SendReportResult = { status: "sent" | "failed" | "test" | "skipped" };

export function makeSendReport(deps: SendReportDeps) {
  return async (periodType: "weekly" | "monthly", now: Date, opts: SendReportOpts = {}): Promise<SendReportResult> => {
    const b = periodType === "weekly" ? weekBounds(now, deps.tz) : monthBounds(now, deps.tz);
    const periodItems = deps.items.listBetween(b.startIso, b.endIso).filter(i => i.price_cents != null);
    // Never send an empty $0 report — nothing wasted, nothing to guilt-trip about.
    if (periodItems.length === 0) return { status: "skipped" };
    const allItems = deps.items.listRecent(2000).filter(i => i.price_cents != null);
    const summary = buildSummary({
      periodType, periodLabel: b.label, periodStart: b.startIso, periodEnd: b.endIso,
      periodItems, allItems, tz: deps.tz,
    });
    const copy = await generateCopy(summary, deps.anthropic);
    const to = opts.toOverride ?? (typeof deps.to === "function" ? deps.to() : deps.to);
    return sendSummaryEmail(summary, {
      resend: deps.resend, emailLog: deps.emailLog, from: deps.from, to, copy,
      renderHtml: renderEmailHtml, now: () => new Date().toISOString(), markTest: opts.markTest,
    });
  };
}
