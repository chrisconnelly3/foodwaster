import type { DB } from "../connection.js";
import type { EmailLogRow } from "../../types.js";

export class EmailLogRepo {
  constructor(private db: DB) {}
  record(r: Omit<EmailLogRow, "id" | "sent_at">, sentAt: string): void {
    this.db.prepare(
      `INSERT INTO email_log (period_type, period_start, period_end, total_cents, sent_at, status)
       VALUES (?,?,?,?,?,?)`
    ).run(r.period_type, r.period_start, r.period_end, r.total_cents, sentAt, r.status);
  }
  alreadySent(periodType: "weekly" | "monthly", periodStart: string): boolean {
    const row = this.db.prepare(
      "SELECT 1 FROM email_log WHERE period_type=? AND period_start=? AND status='sent' LIMIT 1"
    ).get(periodType, periodStart);
    return !!row;
  }
}
