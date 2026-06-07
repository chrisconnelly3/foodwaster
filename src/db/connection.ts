import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export type DB = DatabaseSync;
const here = dirname(fileURLToPath(import.meta.url));

export function openDb(path: string): DB {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}

export function migrate(db: DB): void {
  const sql = readFileSync(join(here, "schema.sql"), "utf8");
  db.exec(sql);
}
