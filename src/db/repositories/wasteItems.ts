import type { DB } from "../connection.js";
import type { WasteItem, NewWasteItem, ItemStatus, PriceSource } from "../../types.js";

export class WasteItemsRepo {
  constructor(private db: DB) {}

  create(n: NewWasteItem, capturedAt: string): number {
    const stmt = this.db.prepare(
      `INSERT INTO waste_item (captured_at, grocer, capture_type, barcode, photo_path, qty, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`
    );
    const info = stmt.run(capturedAt, n.grocer, n.capture_type, n.barcode ?? null,
      n.photo_path ?? null, n.qty ?? 1, n.notes ?? null);
    return Number(info.lastInsertRowid);
  }

  get(id: number): WasteItem | undefined {
    return this.db.prepare("SELECT * FROM waste_item WHERE id = ?").get(id) as WasteItem | undefined;
  }

  setIdentity(id: number, p: { product_name: string; brand: string | null; category: string | null; confidence: number }): void {
    this.db.prepare(
      "UPDATE waste_item SET product_name=?, brand=?, category=?, confidence=? WHERE id=?"
    ).run(p.product_name, p.brand, p.category, p.confidence, id);
  }

  setPrice(id: number, p: { price_cents: number; price_source: PriceSource; status: ItemStatus }): void {
    this.db.prepare(
      "UPDATE waste_item SET price_cents=?, price_source=?, status=? WHERE id=?"
    ).run(p.price_cents, p.price_source, p.status, id);
  }

  setStatus(id: number, status: ItemStatus): void {
    this.db.prepare("UPDATE waste_item SET status=? WHERE id=?").run(status, id);
  }

  listPending(): WasteItem[] {
    return this.db.prepare("SELECT * FROM waste_item WHERE status='pending' ORDER BY captured_at").all() as WasteItem[];
  }

  listBetween(startIso: string, endIso: string): WasteItem[] {
    return this.db.prepare(
      "SELECT * FROM waste_item WHERE captured_at >= ? AND captured_at < ? ORDER BY captured_at"
    ).all(startIso, endIso) as WasteItem[];
  }

  listRecent(limit = 100): WasteItem[] {
    return this.db.prepare("SELECT * FROM waste_item ORDER BY captured_at DESC LIMIT ?").all(limit) as WasteItem[];
  }
}
