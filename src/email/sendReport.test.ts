import { describe, it, expect, beforeEach, vi } from "vitest";
import { openDb, migrate, DB } from "../db/connection.js";
import { WasteItemsRepo } from "../db/repositories/wasteItems.js";
import { EmailLogRepo } from "../db/repositories/emailLog.js";
import { makeSendReport } from "./sendReport.js";

let db: DB; let items: WasteItemsRepo; let emailLog: EmailLogRepo;
const anthropic = () => ({ messages: { create: vi.fn().mockResolvedValue({ content: [{ type: "text", text: JSON.stringify({ subject: "S", headline: "H", body: "B", tips: ["t1"] }) }] }) } });

beforeEach(() => { db = openDb(":memory:"); migrate(db); items = new WasteItemsRepo(db); emailLog = new EmailLogRepo(db); });

function addJuneItem() {
  const id = items.create({ grocer: "kroger", capture_type: "barcode" }, "2026-06-10T00:00:00Z");
  items.setIdentity(id, { product_name: "Milk", brand: null, category: "dairy", confidence: 1 });
  items.setPrice(id, { price_cents: 500, price_source: "api", status: "priced" });
}

describe("makeSendReport", () => {
  it("skips (never sends a $0 email) when the period has no items", async () => {
    const send = vi.fn();
    const sr = makeSendReport({ items, emailLog, anthropic: anthropic() as any, resend: { emails: { send } } as any, from: "b@x.com", to: "w@x.com", tz: "UTC" });
    const r = await sr("monthly", new Date("2026-06-15T12:00:00Z"));
    expect(r.status).toBe("skipped");
    expect(send).not.toHaveBeenCalled();
  });

  it("sends the month's report and records a real 'sent' row", async () => {
    addJuneItem();
    const send = vi.fn().mockResolvedValue({ data: { id: "e" }, error: null });
    const sr = makeSendReport({ items, emailLog, anthropic: anthropic() as any, resend: { emails: { send } } as any, from: "b@x.com", to: "w@x.com", tz: "UTC" });
    const r = await sr("monthly", new Date("2026-06-15T12:00:00Z"));
    expect(r.status).toBe("sent");
    expect(send).toHaveBeenCalled();
    expect(emailLog.alreadySent("monthly", "2026-06-01T00:00:00.000Z")).toBe(true);
  });

  it("markTest records 'test' (does NOT block de-dup) and toOverride sets the recipient", async () => {
    addJuneItem();
    const send = vi.fn().mockResolvedValue({ data: { id: "e" }, error: null });
    const sr = makeSendReport({ items, emailLog, anthropic: anthropic() as any, resend: { emails: { send } } as any, from: "b@x.com", to: "w@x.com", tz: "UTC" });
    const r = await sr("monthly", new Date("2026-06-15T12:00:00Z"), { toOverride: "chris@x.com", markTest: true });
    expect(r.status).toBe("test");
    expect(send.mock.calls[0][0].to).toBe("chris@x.com");
    expect(emailLog.alreadySent("monthly", "2026-06-01T00:00:00.000Z")).toBe(false);
  });
});
