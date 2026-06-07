import type { Resend } from "resend";
import type { EmailSummary } from "./summaryBuilder.js";
import type { EmailCopy } from "./copywriter.js";
import type { EmailLogRepo } from "../db/repositories/emailLog.js";

export interface SendDeps {
  resend: Resend; emailLog: EmailLogRepo; from: string; to: string;
  copy: EmailCopy;
  renderHtml: (s: EmailSummary, copy: EmailCopy, cid: string) => string;
  renderChart: (s: EmailSummary) => Promise<Buffer>;
  now: () => string;
}

export async function sendSummaryEmail(s: EmailSummary, deps: SendDeps): Promise<{ status: "sent" | "failed" }> {
  const cid = "trend-chart";
  const html = deps.renderHtml(s, deps.copy, cid);

  // Chart is best-effort: if QuickChart is unreachable, still send the email (without the image).
  let attachments: any[] | undefined;
  try {
    const png = await deps.renderChart(s);
    attachments = [{ filename: "trend.png", content: png, contentId: cid }];
  } catch {
    attachments = undefined;
  }

  let status: "sent" | "failed" = "sent";
  try {
    const res = await deps.resend.emails.send({
      from: deps.from, to: deps.to, subject: deps.copy.subject, html,
      ...(attachments ? { attachments } : {}),
    });
    if ((res as any).error) status = "failed";
  } catch {
    status = "failed";
  }
  deps.emailLog.record({
    period_type: s.periodType, period_start: s.periodStart, period_end: s.periodEnd,
    total_cents: s.totalCents, status,
  }, deps.now());
  return { status };
}
