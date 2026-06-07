CREATE TABLE IF NOT EXISTS waste_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at TEXT NOT NULL,
  grocer TEXT NOT NULL,
  capture_type TEXT NOT NULL,
  barcode TEXT,
  photo_path TEXT,
  product_name TEXT,
  brand TEXT,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  price_cents INTEGER,
  price_source TEXT,
  confidence REAL,
  qty INTEGER NOT NULL DEFAULT 1,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_item_status ON waste_item(status);
CREATE INDEX IF NOT EXISTS idx_item_captured ON waste_item(captured_at);

CREATE TABLE IF NOT EXISTS price_check (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES waste_item(id),
  source TEXT NOT NULL,
  raw_result TEXT,
  success INTEGER NOT NULL,
  ran_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_type TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  sent_at TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES waste_item(id),
  attempts INTEGER NOT NULL DEFAULT 0,
  run_after TEXT NOT NULL,
  claimed_at TEXT,
  done INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_job_pending ON job(done, run_after);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
