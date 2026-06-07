import type { DB } from "../connection.js";
import type { PriceCheck } from "../../types.js";

export class PriceChecksRepo {
  constructor(private db: DB) {}
  record(itemId: number, source: string, raw: string, success: boolean, ranAt: string): void {
    this.db.prepare(
      "INSERT INTO price_check (item_id, source, raw_result, success, ran_at) VALUES (?,?,?,?,?)"
    ).run(itemId, source, raw, success ? 1 : 0, ranAt);
  }
  listForItem(itemId: number): PriceCheck[] {
    return this.db.prepare("SELECT * FROM price_check WHERE item_id=? ORDER BY ran_at").all(itemId) as PriceCheck[];
  }
}
