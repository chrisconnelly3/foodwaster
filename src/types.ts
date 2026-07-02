export type Grocer = "whole_foods" | "kroger" | "target";
export type CaptureType = "barcode" | "photo";
export type ItemStatus = "pending" | "priced" | "failed" | "manual";
export type PriceSource = "scrape" | "api" | "ai_estimate" | "manual";

export interface WasteItem {
  id: number;
  captured_at: string;          // ISO UTC
  grocer: Grocer;
  capture_type: CaptureType;
  barcode: string | null;
  photo_path: string | null;
  product_name: string | null;
  brand: string | null;
  category: string | null;      // produce|dairy|meat|bakery|pantry|frozen|beverage|other
  status: ItemStatus;
  price_cents: number | null;
  price_source: PriceSource | null;
  confidence: number | null;    // 0..1
  qty: number;
  notes: string | null;
}

export type NewWasteItem = Pick<WasteItem, "grocer" | "capture_type"> &
  Partial<Pick<WasteItem, "barcode" | "photo_path" | "qty" | "notes">>;

export interface PriceCheck {
  id: number; item_id: number; source: PriceSource | "openfoodfacts";
  raw_result: string; success: 0 | 1; ran_at: string;
}

export interface EmailLogRow {
  id: number; period_type: "weekly" | "monthly";
  period_start: string; period_end: string;
  total_cents: number; sent_at: string; status: "sent" | "failed" | "test";
}
