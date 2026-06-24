import type { Resend } from "resend";
import type { EmailSummary } from "./summaryBuilder.js";
import type { EmailCopy } from "./copywriter.js";
import type { EmailLogRepo } from "../db/repositories/emailLog.js";

export interface SendDeps {
  resend: Resend; emailLog: EmailLogRepo; from: string; to: string;
  copy: EmailCopy;
  renderHtml: (s: EmailSummary, copy: EmailCopy) => string;
  now: () => string;
}

export async function sendSummaryEmail(s: EmailSummary, deps: SendDeps): Promise<{ status: "sent" | "failed" }> {
  // The trend chart is an inline hosted <img> in the HTML — no attachment needed.
  const html = deps.renderHtml(s, deps.copy);

  let status: "sent" | "failed" = "sent";
  try {
    const res = await deps.resend.emails.send({ from: deps.from, to: deps.to, subject: deps.copy.subject, html });
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
