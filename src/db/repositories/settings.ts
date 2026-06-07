import type { DB } from "../connection.js";

export class SettingsRepo {
  constructor(private db: DB) {}
  get(key: string, fallback: string): string {
    const row = this.db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined;
    return row?.value ?? fallback;
  }
  set(key: string, value: string): void {
    this.db.prepare(
      "INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    ).run(key, value);
  }
}
