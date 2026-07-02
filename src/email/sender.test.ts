import { describe, it, expect, vi, beforeEach } from "vitest";
import { openDb, migrate, DB } from "../db/connection.js";
import { EmailLogRepo } from "../db/repositories/emailLog.js";
import { sendSummaryEmail } from "./sender.js";
import type { EmailSummary } from "./summaryBuilder.js";

let db: DB;
beforeEach(() => { db = openDb(":memory:"); migrate(db); });

const summary = {
  periodType: "weekly", periodLabel: "Jun 1 – Jun 7", periodStart: "2026-06-01", periodEnd: "2026-06-08",
  totalCents: 4713, itemCount: 6, projectedAnnualCents: 245076,
  byCategory: [], byGrocer: [{ grocer: "whole_foods", cents: 4713, pct: 100 }],
  worstGrocer: { grocer: "whole_foods", cents: 4713, pct: 100 },
  repeatOffenders: [], items: [], trend: [], photoPaths: [],
} as EmailSummary;

describe("sendSummaryEmail", () => {
  it("sends via resend and records a sent row", async () => {
    const resend = { emails: { send: vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null }) } };
    const deps = {
      resend, emailLog: new EmailLogRepo(db), from: "Bot <b@x.com>", to: "w@x.com",
      renderHtml: () => "<html>x</html>",
      copy: { subject: "Subj", headline: "H", body: "B", tips: [] }, now: () => "2026-06-08T13:00:00Z",
    };
    const r = await sendSummaryEmail(summary, deps as any);
    expect(r.status).toBe("sent");
    expect(resend.emails.send).toHaveBeenCalled();
    expect(new EmailLogRepo(db).alreadySent("weekly", "2026-06-01")).toBe(true);
  });

  it("records failed when resend returns an error", async () => {
    const resend = { emails: { send: vi.fn().mockResolvedValue({ data: null, error: { message: "bad" } }) } };
    const deps = {
      resend, emailLog: new EmailLogRepo(db), from: "Bot <b@x.com>", to: "w@x.com",
      renderHtml: () => "<html>x</html>",
      copy: { subject: "S", headline: "H", body: "B", tips: [] }, now: () => "2026-06-08T13:00:00Z",
    };
    const r = await sendSummaryEmail(summary, deps as any);
    expect(r.status).toBe("failed");
  });

  it("records status 'test' when markTest is set (so de-dup ignores it)", async () => {
    const resend = { emails: { send: vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null }) } };
    const deps = {
      resend, emailLog: new EmailLogRepo(db), from: "Bot <b@x.com>", to: "w@x.com",
      renderHtml: () => "<html>x</html>", markTest: true,
      copy: { subject: "S", headline: "H", body: "B", tips: [] }, now: () => "2026-06-08T13:00:00Z",
    };
    const r = await sendSummaryEmail(summary, deps as any);
    expect(r.status).toBe("test");
    expect(new EmailLogRepo(db).alreadySent("weekly", "2026-06-01")).toBe(false);
  });

  it("does not send a chart attachment (chart is an inline hosted image)", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null });
    const deps = {
      resend: { emails: { send } }, emailLog: new EmailLogRepo(db), from: "Bot <b@x.com>", to: "w@x.com",
      renderHtml: () => "<html>x</html>",
      copy: { subject: "S", headline: "H", body: "B", tips: [] }, now: () => "2026-06-08T13:00:00Z",
    };
    await sendSummaryEmail(summary, deps as any);
    expect(send.mock.calls[0][0].attachments).toBeUndefined();
  });
});
