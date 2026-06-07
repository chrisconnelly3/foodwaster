import type { DB } from "../db/connection.js";

export interface Job { id: number; item_id: number; attempts: number; run_after: string; claimed_at: string | null; done: 0 | 1; }

export class JobQueue {
  constructor(private db: DB) {}

  enqueue(itemId: number, runAfter: string): void {
    this.db.prepare("INSERT INTO job (item_id, run_after) VALUES (?, ?)").run(itemId, runAfter);
  }

  claimNext(nowIso: string): Job | undefined {
    // node:sqlite has no db.transaction() helper; use manual BEGIN/COMMIT.
    this.db.exec("BEGIN");
    try {
      const job = this.db.prepare(
        "SELECT * FROM job WHERE done=0 AND claimed_at IS NULL AND run_after <= ? ORDER BY run_after LIMIT 1"
      ).get(nowIso) as Job | undefined;
      if (!job) { this.db.exec("COMMIT"); return undefined; }
      this.db.prepare("UPDATE job SET claimed_at=? WHERE id=?").run(nowIso, job.id);
      this.db.exec("COMMIT");
      return job;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  complete(id: number): void {
    this.db.prepare("UPDATE job SET done=1 WHERE id=?").run(id);
  }

  retry(id: number, runAfter: string): void {
    this.db.prepare("UPDATE job SET attempts=attempts+1, run_after=?, claimed_at=NULL WHERE id=?").run(runAfter, id);
  }

  pendingCount(): number {
    return (this.db.prepare("SELECT COUNT(*) c FROM job WHERE done=0").get() as { c: number }).c;
  }
}
