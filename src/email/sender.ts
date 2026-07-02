import type { Resend } from "resend";
import type { EmailSummary } from "./summaryBuilder.js";
import type { EmailCopy } from "./copywriter.js";
import type { EmailLogRepo } from "../db/repositories/emailLog.js";

export interface SendDeps {
  resend: Resend; emailLog: EmailLogRepo; from: string; to: string;
  copy: EmailCopy;
  renderHtml: (s: EmailSummary, copy: EmailCopy) => string;
  now: () => string;
  markTest?: boolean; // true = record as "test" so the cron's de-dup never counts it as a real send
}

export async function sendSummaryEmail(s: EmailSummary, deps: SendDeps): Promise<{ status: "sent" | "failed" | "test" }> {
  // The trend chart is an inline hosted <img> in the HTML — no attachment needed.
  const html = deps.renderHtml(s, deps.copy);

  let ok = true;
  try {
    const res = await deps.resend.emails.send({ from: deps.from, to: deps.to, subject: deps.copy.subject, html });
    if ((res as any).error) ok = false;
  } catch {
    ok = false;
  }
  const status: "sent" | "failed" | "test" = !ok ? "failed" : deps.markTest ? "test" : "sent";
  deps.emailLog.record({
    period_type: s.periodType, period_start: s.periodStart, period_end: s.periodEnd,
    total_cents: s.totalCents, status,
  }, deps.now());
  return { status };
}
