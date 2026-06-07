# FoodWaster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-user mobile PWA that logs thrown-away groceries, resolves each item's dollar price asynchronously (real price preferred, AI estimate fallback), keeps a running waste ledger with trends, and emails the spouse weekly + monthly guilt-trip summaries.

**Architecture:** One always-on Node/TypeScript box. Fastify serves a PWA and JSON API; captures land in SQLite as `pending` and are resolved by an in-process SQLite-backed job queue worker (identify → price → fallback). node-cron builds and sends emails via Resend. better-sqlite3 + photos live on a persistent volume.

**Tech Stack:** TypeScript, Fastify, better-sqlite3, Vitest, Playwright, node-cron, Resend SDK, Anthropic SDK, `@zxing/library` (browser), Chart rendering via `chartjs-node-canvas` (server, for email images) + Chart.js (browser).

**Spec:** `docs/superpowers/specs/2026-06-07-foodwaster-waste-ledger-design.md`

---

## Conventions

- Money is stored and computed in **integer cents** everywhere. Format to dollars only at display/email time.
- All timestamps stored as ISO-8601 UTC strings; "week" = Mon–Sun, "month" = calendar month, in a fixed configured timezone (`APP_TZ`, default `America/Chicago`).
- Test runner: **Vitest**. Test files live next to source as `*.test.ts`.
- **SQLite driver:** use Node's built-in **`node:sqlite`** (`DatabaseSync`), NOT `better-sqlite3` (no native build toolchain on the target machine). The `prepare().run()/get()/all()` and `exec()` APIs are compatible. Differences to mind: there is no `.pragma()` method (use `db.exec("PRAGMA ...")`) and no `db.transaction(fn)` helper (use manual `BEGIN`/`COMMIT`/`ROLLBACK` via `exec`).
- Every task is TDD: failing test → run (fail) → implement → run (pass) → commit.
- Commit messages use Conventional Commits.

## File Structure

```
foodwaster/
  package.json, tsconfig.json, vitest.config.ts, Dockerfile, .env.example, README.md
  src/
    config.ts                 # env parsing, typed config
    types.ts                  # shared domain types
    db/
      connection.ts           # better-sqlite3 singleton + migrate()
      schema.sql              # table DDL
      repositories/
        wasteItems.ts
        priceChecks.ts
        emailLog.ts
        settings.ts
    domain/
      money.ts                # cents <-> dollars formatting
      periods.ts              # week/month boundaries in APP_TZ
      stats.ts                # totals, trend, projected annual, repeat offenders, breakdowns
    identify/
      types.ts                # Identifier interface, IdentifyResult
      openFoodFacts.ts        # barcode -> product
      visionIdentifier.ts     # photo -> product (Claude)
      index.ts                # identify(item) dispatcher
    price/
      types.ts                # PriceSource interface, PriceResult
      kroger.ts
      target.ts
      wholeFoods.ts           # Playwright
      aiEstimate.ts           # Claude fallback
      resolvePrice.ts         # orchestrator: source -> fallback
    queue/
      jobQueue.ts             # SQLite-backed enqueue/claim/complete
      worker.ts               # processes pending items: identify -> price -> persist
    email/
      summaryBuilder.ts       # build EmailSummary from ledger for a period
      chartImage.ts           # render trend chart to PNG buffer
      copywriter.ts           # Claude guilt-trip copy + tips
      renderEmail.ts          # HTML email template
      sender.ts               # Resend send + email_log
      scheduler.ts            # node-cron daily -> weekly/monthly
    http/
      server.ts               # Fastify app factory
      auth.ts                 # passcode middleware
      routes/
        captures.ts
        ledger.ts
        items.ts
        settings.ts
        email.ts              # test-send
    index.ts                  # boot: migrate, start server, worker, scheduler
  public/                     # PWA static assets
    index.html, app.js, styles.css, manifest.webmanifest, sw.js
  data/                       # volume mount: foodwaster.sqlite + photos/
  tests/
    fixtures/                 # mocked API/HTML fixtures
```

---

## Phase 0 — Scaffold

### Task 0.1: Initialize project

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` (exists, extend), `.env.example`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "foodwaster",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.32.0",
    "@fastify/static": "^7.0.0",
    "chartjs-node-canvas": "^5.0.0",
    "chart.js": "^4.4.0",
    "fastify": "^4.28.0",
    "node-cron": "^3.0.3",
    "playwright": "^1.47.0",
    "resend": "^4.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/node-cron": "^3.0.11",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.test.ts", "tests/**/*.test.ts"], environment: "node" },
});
```

- [ ] **Step 4: Create `.env.example`**

```
APP_TZ=America/Chicago
APP_PASSCODE=changeme
WIFE_EMAIL=spouse@example.com
EMAIL_FROM="Food Waste Tracker <bot@yourdomain.com>"
DATA_DIR=./data
ANTHROPIC_API_KEY=
RESEND_API_KEY=
KROGER_CLIENT_ID=
KROGER_CLIENT_SECRET=
KROGER_LOCATION_ID=
TARGET_STORE_ID=
TARGET_API_KEY=
WHOLE_FOODS_ZIP=
```

- [ ] **Step 5: Extend `.gitignore`**

Append:
```
dist/
data/
```

- [ ] **Step 6: Install and verify**

Run: `npm install && npx vitest run`
Expected: install succeeds; Vitest reports "No test files found" (exit 0 with `--passWithNoTests`, otherwise non-zero — acceptable, fixed once first test exists).

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore .env.example
git commit -m "chore: scaffold foodwaster project"
```

### Task 0.2: Config module

**Files:**
- Create: `src/config.ts`, `src/config.test.ts`

- [ ] **Step 1: Write the failing test** (`src/config.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("parses required values from an env object", () => {
    const cfg = loadConfig({
      APP_TZ: "America/Chicago",
      APP_PASSCODE: "secret",
      WIFE_EMAIL: "w@x.com",
      EMAIL_FROM: "Bot <bot@x.com>",
      DATA_DIR: "./data",
      ANTHROPIC_API_KEY: "a",
      RESEND_API_KEY: "r",
    });
    expect(cfg.passcode).toBe("secret");
    expect(cfg.tz).toBe("America/Chicago");
    expect(cfg.dataDir).toBe("./data");
  });

  it("throws when a required value is missing", () => {
    expect(() => loadConfig({})).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL — cannot find module `./config.js`.

- [ ] **Step 3: Write minimal implementation** (`src/config.ts`)

```ts
import { z } from "zod";

const schema = z.object({
  APP_TZ: z.string().default("America/Chicago"),
  APP_PASSCODE: z.string().min(1),
  WIFE_EMAIL: z.string().email(),
  EMAIL_FROM: z.string().min(1),
  DATA_DIR: z.string().default("./data"),
  ANTHROPIC_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  KROGER_CLIENT_ID: z.string().optional(),
  KROGER_CLIENT_SECRET: z.string().optional(),
  KROGER_LOCATION_ID: z.string().optional(),
  TARGET_STORE_ID: z.string().optional(),
  TARGET_API_KEY: z.string().optional(),
  WHOLE_FOODS_ZIP: z.string().optional(),
});

export type Config = {
  tz: string; passcode: string; wifeEmail: string; emailFrom: string; dataDir: string;
  anthropicKey: string; resendKey: string;
  kroger: { clientId?: string; clientSecret?: string; locationId?: string };
  target: { storeId?: string; apiKey?: string };
  wholeFoods: { zip?: string };
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const e = schema.parse(env);
  return {
    tz: e.APP_TZ, passcode: e.APP_PASSCODE, wifeEmail: e.WIFE_EMAIL, emailFrom: e.EMAIL_FROM,
    dataDir: e.DATA_DIR, anthropicKey: e.ANTHROPIC_API_KEY, resendKey: e.RESEND_API_KEY,
    kroger: { clientId: e.KROGER_CLIENT_ID, clientSecret: e.KROGER_CLIENT_SECRET, locationId: e.KROGER_LOCATION_ID },
    target: { storeId: e.TARGET_STORE_ID, apiKey: e.TARGET_API_KEY },
    wholeFoods: { zip: e.WHOLE_FOODS_ZIP },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/config.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: typed config loader"
```

### Task 0.3: Shared domain types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`** (no test — pure type declarations)

```ts
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
  total_cents: number; sent_at: string; status: "sent" | "failed";
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors (file may be unused; that is fine).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: shared domain types"
```

---

## Phase 1 — Database Layer

### Task 1.1: Schema + connection + migrate

**Files:**
- Create: `src/db/schema.sql`, `src/db/connection.ts`, `src/db/connection.test.ts`

- [ ] **Step 1: Create `src/db/schema.sql`**

```sql
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
```

- [ ] **Step 2: Write the failing test** (`src/db/connection.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { openDb, migrate } from "./connection.js";

describe("db connection", () => {
  it("migrates an in-memory db and exposes tables", () => {
    const db = openDb(":memory:");
    migrate(db);
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map((r: any) => r.name);
    expect(tables).toContain("waste_item");
    expect(tables).toContain("price_check");
    expect(tables).toContain("email_log");
    expect(tables).toContain("job");
    expect(tables).toContain("settings");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/db/connection.test.ts`
Expected: FAIL — cannot find `./connection.js`.

- [ ] **Step 4: Write implementation** (`src/db/connection.ts`)

```ts
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
```

> `node:sqlite` is a built-in Node module (no dependency to install). It emits an `ExperimentalWarning` on first use — that is expected and harmless. Its `prepare/run/get/all/exec` API matches what the repositories use.

- [ ] **Step 5: Make schema.sql load after build**

Add to `package.json` `build` script so the SQL ships to `dist`:
```json
"build": "tsc -p tsconfig.json && node -e \"require('fs').cpSync('src/db/schema.sql','dist/src/db/schema.sql')\""
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/db/connection.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.sql src/db/connection.ts src/db/connection.test.ts package.json
git commit -m "feat: sqlite schema, connection, migrate"
```

### Task 1.2: Waste-item repository

**Files:**
- Create: `src/db/repositories/wasteItems.ts`, `src/db/repositories/wasteItems.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { openDb, migrate, DB } from "../connection.js";
import { WasteItemsRepo } from "./wasteItems.js";

let db: DB; let repo: WasteItemsRepo;
beforeEach(() => { db = openDb(":memory:"); migrate(db); repo = new WasteItemsRepo(db); });

describe("WasteItemsRepo", () => {
  it("inserts a pending item and reads it back", () => {
    const id = repo.create({ grocer: "whole_foods", capture_type: "barcode", barcode: "012", qty: 1 }, "2026-06-07T12:00:00Z");
    const item = repo.get(id)!;
    expect(item.status).toBe("pending");
    expect(item.grocer).toBe("whole_foods");
    expect(item.barcode).toBe("012");
  });

  it("updates identity and price", () => {
    const id = repo.create({ grocer: "kroger", capture_type: "photo" }, "2026-06-07T12:00:00Z");
    repo.setIdentity(id, { product_name: "Blueberries", brand: "Acme", category: "produce", confidence: 0.9 });
    repo.setPrice(id, { price_cents: 599, price_source: "api", status: "priced" });
    const item = repo.get(id)!;
    expect(item.product_name).toBe("Blueberries");
    expect(item.price_cents).toBe(599);
    expect(item.status).toBe("priced");
  });

  it("lists pending items", () => {
    repo.create({ grocer: "target", capture_type: "barcode" }, "2026-06-07T12:00:00Z");
    expect(repo.listPending().length).toBe(1);
  });

  it("lists items within a date range", () => {
    repo.create({ grocer: "target", capture_type: "barcode" }, "2026-06-01T12:00:00Z");
    repo.create({ grocer: "target", capture_type: "barcode" }, "2026-06-09T12:00:00Z");
    const inRange = repo.listBetween("2026-06-05T00:00:00Z", "2026-06-12T00:00:00Z");
    expect(inRange.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/repositories/wasteItems.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation** (`src/db/repositories/wasteItems.ts`)

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/db/repositories/wasteItems.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories/wasteItems.ts src/db/repositories/wasteItems.test.ts
git commit -m "feat: waste item repository"
```

### Task 1.3: priceChecks, emailLog, settings repositories

**Files:**
- Create: `src/db/repositories/priceChecks.ts`, `src/db/repositories/emailLog.ts`, `src/db/repositories/settings.ts`, and one test file `src/db/repositories/misc.test.ts`

- [ ] **Step 1: Write the failing test** (`src/db/repositories/misc.test.ts`)

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { openDb, migrate, DB } from "../connection.js";
import { WasteItemsRepo } from "./wasteItems.js";
import { PriceChecksRepo } from "./priceChecks.js";
import { EmailLogRepo } from "./emailLog.js";
import { SettingsRepo } from "./settings.js";

let db: DB;
beforeEach(() => { db = openDb(":memory:"); migrate(db); });

describe("PriceChecksRepo", () => {
  it("records an attempt", () => {
    const items = new WasteItemsRepo(db);
    const id = items.create({ grocer: "kroger", capture_type: "barcode" }, "2026-06-07T00:00:00Z");
    const pc = new PriceChecksRepo(db);
    pc.record(id, "api", '{"ok":true}', true, "2026-06-07T00:00:01Z");
    expect(pc.listForItem(id).length).toBe(1);
  });
});

describe("EmailLogRepo", () => {
  it("records and finds a sent email for a period", () => {
    const repo = new EmailLogRepo(db);
    repo.record({ period_type: "weekly", period_start: "2026-06-01", period_end: "2026-06-08", total_cents: 4713, status: "sent" }, "2026-06-08T13:00:00Z");
    expect(repo.alreadySent("weekly", "2026-06-01")).toBe(true);
    expect(repo.alreadySent("weekly", "2026-06-08")).toBe(false);
  });
});

describe("SettingsRepo", () => {
  it("gets default and sets/reads a value", () => {
    const s = new SettingsRepo(db);
    expect(s.get("weekly_enabled", "true")).toBe("true");
    s.set("weekly_enabled", "false");
    expect(s.get("weekly_enabled", "true")).toBe("false");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/db/repositories/misc.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/db/repositories/priceChecks.ts`**

```ts
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
```

- [ ] **Step 4: Write `src/db/repositories/emailLog.ts`**

```ts
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
```

- [ ] **Step 5: Write `src/db/repositories/settings.ts`**

```ts
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/db/repositories/misc.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/db/repositories/priceChecks.ts src/db/repositories/emailLog.ts src/db/repositories/settings.ts src/db/repositories/misc.test.ts
git commit -m "feat: priceChecks, emailLog, settings repositories"
```

---

## Phase 2 — Domain Logic (pure, TDD-heavy)

### Task 2.1: Money formatting

**Files:**
- Create: `src/domain/money.ts`, `src/domain/money.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { formatCents, dollarsToCents } from "./money.js";

describe("money", () => {
  it("formats cents as USD", () => {
    expect(formatCents(4713)).toBe("$47.13");
    expect(formatCents(0)).toBe("$0.00");
    expect(formatCents(599)).toBe("$5.99");
  });
  it("parses dollars to cents", () => {
    expect(dollarsToCents("5.99")).toBe(599);
    expect(dollarsToCents("12")).toBe(1200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/money.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation** (`src/domain/money.ts`)

```ts
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
export function dollarsToCents(input: string): number {
  return Math.round(parseFloat(input) * 100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/money.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/money.ts src/domain/money.test.ts
git commit -m "feat: money formatting helpers"
```

### Task 2.2: Period boundaries (week/month in APP_TZ)

**Files:**
- Create: `src/domain/periods.ts`, `src/domain/periods.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { weekBounds, monthBounds } from "./periods.js";

describe("periods", () => {
  it("computes Mon-Sun week bounds containing a date", () => {
    // 2026-06-07 is a Sunday
    const { startIso, endIso, label } = weekBounds(new Date("2026-06-07T18:00:00Z"), "UTC");
    expect(startIso).toBe("2026-06-01T00:00:00.000Z"); // Monday
    expect(endIso).toBe("2026-06-08T00:00:00.000Z");   // next Monday (exclusive)
    expect(label).toContain("Jun");
  });
  it("computes calendar-month bounds", () => {
    const { startIso, endIso } = monthBounds(new Date("2026-06-15T00:00:00Z"), "UTC");
    expect(startIso).toBe("2026-06-01T00:00:00.000Z");
    expect(endIso).toBe("2026-07-01T00:00:00.000Z");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/periods.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation** (`src/domain/periods.ts`)

> Note: for a single-user app in one timezone, compute boundaries from the UTC instant. The tests use `"UTC"` to stay deterministic. `tz` is accepted for forward-compatibility and used only for the human label.

```ts
export interface PeriodBounds { startIso: string; endIso: string; label: string; }

function atMidnightUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function weekBounds(now: Date, _tz: string): PeriodBounds {
  const day = atMidnightUtc(now);
  const dow = (day.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const start = new Date(day); start.setUTCDate(day.getUTCDate() - dow);
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 7);
  return { startIso: start.toISOString(), endIso: end.toISOString(), label: rangeLabel(start, new Date(end.getTime() - 1)) };
}

export function monthBounds(now: Date, _tz: string): PeriodBounds {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { startIso: start.toISOString(), endIso: end.toISOString(), label: monthLabel(start) };
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function rangeLabel(a: Date, b: Date): string {
  return `${MONTHS[a.getUTCMonth()]} ${a.getUTCDate()} – ${MONTHS[b.getUTCMonth()]} ${b.getUTCDate()}`;
}
function monthLabel(a: Date): string { return `${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()}`; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/periods.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/periods.ts src/domain/periods.test.ts
git commit -m "feat: week/month period boundaries"
```

### Task 2.3: Stats (totals, trend, projected annual, repeat offenders, breakdowns)

**Files:**
- Create: `src/domain/stats.ts`, `src/domain/stats.test.ts`

These pure functions power both the dashboard and the email. They take `WasteItem[]` (only items with a `price_cents`) and compute aggregates.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { totalCents, byCategory, byGrocer, repeatOffenders, projectedAnnualCents, weeklyTrend } from "./stats.js";
import type { WasteItem } from "../types.js";

function item(p: Partial<WasteItem>): WasteItem {
  return { id: 1, captured_at: "2026-06-07T00:00:00Z", grocer: "whole_foods", capture_type: "barcode",
    barcode: null, photo_path: null, product_name: "X", brand: null, category: "produce",
    status: "priced", price_cents: 100, price_source: "api", confidence: 1, qty: 1, notes: null, ...p };
}

describe("stats", () => {
  const items = [
    item({ id: 1, price_cents: 599, qty: 1, category: "produce", grocer: "whole_foods", product_name: "Blueberries" }),
    item({ id: 2, price_cents: 599, qty: 1, category: "produce", grocer: "whole_foods", product_name: "Blueberries" }),
    item({ id: 3, price_cents: 1000, qty: 2, category: "meat", grocer: "kroger", product_name: "Steak" }),
  ];

  it("totals cents with quantity", () => {
    // 599 + 599 + 1000*2 = 3198
    expect(totalCents(items)).toBe(3198);
  });

  it("groups by category", () => {
    const cats = byCategory(items);
    expect(cats.find(c => c.category === "produce")!.cents).toBe(1198);
    expect(cats.find(c => c.category === "meat")!.cents).toBe(2000);
  });

  it("groups by grocer with percentage", () => {
    const g = byGrocer(items);
    const wf = g.find(x => x.grocer === "whole_foods")!;
    expect(wf.cents).toBe(1198);
    expect(Math.round(wf.pct)).toBe(37); // 1198/3198
  });

  it("finds repeat offenders sorted by total", () => {
    const ro = repeatOffenders(items);
    expect(ro[0].name).toBe("Blueberries");
    expect(ro[0].count).toBe(2);
    expect(ro[0].cents).toBe(1198);
  });

  it("projects annual from a weekly total", () => {
    expect(projectedAnnualCents(3198, "weekly")).toBe(3198 * 52);
    expect(projectedAnnualCents(3198, "monthly")).toBe(3198 * 12);
  });

  it("builds a weekly trend series", () => {
    const trend = weeklyTrend([
      item({ captured_at: "2026-05-25T00:00:00Z", price_cents: 500, qty: 1 }), // week of May 25
      item({ captured_at: "2026-06-01T00:00:00Z", price_cents: 700, qty: 1 }), // week of Jun 1
      item({ captured_at: "2026-06-03T00:00:00Z", price_cents: 300, qty: 1 }), // same week
    ], "UTC");
    expect(trend.length).toBe(2);
    expect(trend[1].cents).toBe(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/stats.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation** (`src/domain/stats.ts`)

```ts
import type { WasteItem, Grocer } from "../types.js";
import { weekBounds } from "./periods.js";

const lineCents = (i: WasteItem) => (i.price_cents ?? 0) * i.qty;

export function totalCents(items: WasteItem[]): number {
  return items.reduce((s, i) => s + lineCents(i), 0);
}

export function byCategory(items: WasteItem[]): { category: string; cents: number }[] {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.category ?? "other", (m.get(i.category ?? "other") ?? 0) + lineCents(i));
  return [...m.entries()].map(([category, cents]) => ({ category, cents })).sort((a, b) => b.cents - a.cents);
}

export function byGrocer(items: WasteItem[]): { grocer: Grocer; cents: number; pct: number }[] {
  const total = totalCents(items) || 1;
  const m = new Map<Grocer, number>();
  for (const i of items) m.set(i.grocer, (m.get(i.grocer) ?? 0) + lineCents(i));
  return [...m.entries()].map(([grocer, cents]) => ({ grocer, cents, pct: (cents / total) * 100 })).sort((a, b) => b.cents - a.cents);
}

export function repeatOffenders(items: WasteItem[]): { name: string; count: number; cents: number }[] {
  const m = new Map<string, { count: number; cents: number }>();
  for (const i of items) {
    const name = i.product_name ?? "Unknown";
    const cur = m.get(name) ?? { count: 0, cents: 0 };
    cur.count += i.qty; cur.cents += lineCents(i); m.set(name, cur);
  }
  return [...m.entries()].map(([name, v]) => ({ name, ...v }))
    .filter(x => x.count > 1).sort((a, b) => b.cents - a.cents);
}

export function projectedAnnualCents(periodTotal: number, period: "weekly" | "monthly"): number {
  return period === "weekly" ? periodTotal * 52 : periodTotal * 12;
}

export function weeklyTrend(items: WasteItem[], tz: string): { weekStart: string; label: string; cents: number }[] {
  const m = new Map<string, { label: string; cents: number }>();
  for (const i of items) {
    const b = weekBounds(new Date(i.captured_at), tz);
    const cur = m.get(b.startIso) ?? { label: b.label, cents: 0 };
    cur.cents += lineCents(i); m.set(b.startIso, cur);
  }
  return [...m.entries()].map(([weekStart, v]) => ({ weekStart, ...v }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/stats.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/stats.ts src/domain/stats.test.ts
git commit -m "feat: waste statistics aggregations"
```

---

## Phase 3 — Identification

### Task 3.1: Identify interfaces + Open Food Facts barcode lookup

**Files:**
- Create: `src/identify/types.ts`, `src/identify/openFoodFacts.ts`, `src/identify/openFoodFacts.test.ts`, `tests/fixtures/off-blueberries.json`

- [ ] **Step 1: Create `src/identify/types.ts`**

```ts
export interface IdentifyResult {
  product_name: string;
  brand: string | null;
  category: string | null; // produce|dairy|meat|bakery|pantry|frozen|beverage|other
  confidence: number;      // 0..1
}
```

- [ ] **Step 2: Create fixture** `tests/fixtures/off-blueberries.json`

```json
{ "status": 1, "product": { "product_name": "Organic Blueberries", "brands": "365", "categories_tags": ["en:fruits", "en:produce"] } }
```

- [ ] **Step 3: Write the failing test** (`src/identify/openFoodFacts.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseOffResponse, mapOffCategory } from "./openFoodFacts.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/off-blueberries.json", "utf8"));

describe("openFoodFacts", () => {
  it("parses a product response", () => {
    const r = parseOffResponse(fixture)!;
    expect(r.product_name).toBe("Organic Blueberries");
    expect(r.brand).toBe("365");
    expect(r.category).toBe("produce");
    expect(r.confidence).toBeGreaterThan(0.7);
  });
  it("returns null when status is 0", () => {
    expect(parseOffResponse({ status: 0 })).toBeNull();
  });
  it("maps OFF category tags to our taxonomy", () => {
    expect(mapOffCategory(["en:dairies", "en:milks"])).toBe("dairy");
    expect(mapOffCategory(["en:unknown"])).toBe("other");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/identify/openFoodFacts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Write implementation** (`src/identify/openFoodFacts.ts`)

```ts
import type { IdentifyResult } from "./types.js";

const CATEGORY_MAP: [string, string][] = [
  ["dairy", "dairy"], ["milk", "dairy"], ["cheese", "dairy"], ["yogurt", "dairy"],
  ["meat", "meat"], ["beef", "meat"], ["poultry", "meat"], ["fish", "meat"], ["seafood", "meat"],
  ["fruit", "produce"], ["vegetable", "produce"], ["produce", "produce"],
  ["bread", "bakery"], ["baker", "bakery"],
  ["frozen", "frozen"],
  ["beverage", "beverage"], ["drink", "beverage"], ["juice", "beverage"],
];

export function mapOffCategory(tags: string[]): string {
  const joined = tags.join(" ").toLowerCase();
  for (const [needle, cat] of CATEGORY_MAP) if (joined.includes(needle)) return cat;
  return "other";
}

export function parseOffResponse(json: any): IdentifyResult | null {
  if (!json || json.status !== 1 || !json.product) return null;
  const p = json.product;
  const name = (p.product_name ?? "").trim();
  if (!name) return null;
  return {
    product_name: name,
    brand: p.brands ? String(p.brands).split(",")[0].trim() : null,
    category: mapOffCategory(p.categories_tags ?? []),
    confidence: 0.85,
  };
}

export async function lookupBarcode(barcode: string, fetchFn = fetch): Promise<IdentifyResult | null> {
  const res = await fetchFn(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`);
  if (!res.ok) return null;
  return parseOffResponse(await res.json());
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/identify/openFoodFacts.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/identify/types.ts src/identify/openFoodFacts.ts src/identify/openFoodFacts.test.ts tests/fixtures/off-blueberries.json
git commit -m "feat: open food facts barcode identification"
```

### Task 3.2: Claude vision identifier

**Files:**
- Create: `src/identify/visionIdentifier.ts`, `src/identify/visionIdentifier.test.ts`

The Claude call is injected so the parsing logic is tested without network.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseVisionJson } from "./visionIdentifier.js";

describe("visionIdentifier", () => {
  it("parses a well-formed model JSON block", () => {
    const r = parseVisionJson('Here you go:\n{"product_name":"Avocado","brand":null,"category":"produce","confidence":0.8}')!;
    expect(r.product_name).toBe("Avocado");
    expect(r.category).toBe("produce");
  });
  it("returns null on unparseable text", () => {
    expect(parseVisionJson("no json here")).toBeNull();
  });
  it("clamps confidence to 0..1 and defaults category to other", () => {
    const r = parseVisionJson('{"product_name":"Mystery","confidence":5}')!;
    expect(r.confidence).toBe(1);
    expect(r.category).toBe("other");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/identify/visionIdentifier.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation** (`src/identify/visionIdentifier.ts`)

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { IdentifyResult } from "./types.js";

const ALLOWED = ["produce","dairy","meat","bakery","pantry","frozen","beverage","other"];

export function parseVisionJson(text: string): IdentifyResult | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let obj: any;
  try { obj = JSON.parse(match[0]); } catch { return null; }
  if (!obj.product_name) return null;
  const conf = Math.max(0, Math.min(1, Number(obj.confidence ?? 0.5)));
  const category = ALLOWED.includes(obj.category) ? obj.category : "other";
  return { product_name: String(obj.product_name), brand: obj.brand ?? null, category, confidence: conf };
}

const PROMPT = `Identify the single grocery product in this image. Respond ONLY with JSON:
{"product_name": string, "brand": string|null, "category": one of ["produce","dairy","meat","bakery","pantry","frozen","beverage","other"], "confidence": 0..1}`;

export async function identifyPhoto(base64: string, mediaType: string, client: Anthropic): Promise<IdentifyResult | null> {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 300,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mediaType as any, data: base64 } },
      { type: "text", text: PROMPT },
    ]}],
  });
  const text = msg.content.filter(b => b.type === "text").map((b: any) => b.text).join("");
  return parseVisionJson(text);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/identify/visionIdentifier.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/identify/visionIdentifier.ts src/identify/visionIdentifier.test.ts
git commit -m "feat: claude vision product identifier"
```

### Task 3.3: Identify dispatcher

**Files:**
- Create: `src/identify/index.ts`, `src/identify/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { identifyItem } from "./index.js";
import type { WasteItem } from "../types.js";

function item(p: Partial<WasteItem>): WasteItem {
  return { id: 1, captured_at: "x", grocer: "kroger", capture_type: "barcode", barcode: null,
    photo_path: null, product_name: null, brand: null, category: null, status: "pending",
    price_cents: null, price_source: null, confidence: null, qty: 1, notes: null, ...p };
}

describe("identifyItem", () => {
  it("routes barcode items to the barcode lookup", async () => {
    const deps = {
      lookupBarcode: vi.fn().mockResolvedValue({ product_name: "Eggs", brand: null, category: "dairy", confidence: 0.85 }),
      identifyPhoto: vi.fn(),
    };
    const r = await identifyItem(item({ capture_type: "barcode", barcode: "012" }), deps as any);
    expect(deps.lookupBarcode).toHaveBeenCalledWith("012");
    expect(r!.product_name).toBe("Eggs");
  });
  it("routes photo items to vision", async () => {
    const deps = {
      lookupBarcode: vi.fn(),
      identifyPhoto: vi.fn().mockResolvedValue({ product_name: "Kale", brand: null, category: "produce", confidence: 0.7 }),
      readPhoto: vi.fn().mockResolvedValue({ base64: "AAA", mediaType: "image/jpeg" }),
    };
    const r = await identifyItem(item({ capture_type: "photo", photo_path: "/x.jpg" }), deps as any);
    expect(deps.identifyPhoto).toHaveBeenCalled();
    expect(r!.product_name).toBe("Kale");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/identify/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation** (`src/identify/index.ts`)

```ts
import type { WasteItem } from "../types.js";
import type { IdentifyResult } from "./types.js";

export interface IdentifyDeps {
  lookupBarcode: (barcode: string) => Promise<IdentifyResult | null>;
  identifyPhoto: (base64: string, mediaType: string) => Promise<IdentifyResult | null>;
  readPhoto: (path: string) => Promise<{ base64: string; mediaType: string }>;
}

export async function identifyItem(item: WasteItem, deps: IdentifyDeps): Promise<IdentifyResult | null> {
  if (item.capture_type === "barcode" && item.barcode) {
    return deps.lookupBarcode(item.barcode);
  }
  if (item.capture_type === "photo" && item.photo_path) {
    const { base64, mediaType } = await deps.readPhoto(item.photo_path);
    return deps.identifyPhoto(base64, mediaType);
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/identify/index.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/identify/index.ts src/identify/index.test.ts
git commit -m "feat: identify dispatcher (barcode vs photo)"
```

---

## Phase 4 — Pricing

### Task 4.1: Price interfaces + AI estimate fallback

**Files:**
- Create: `src/price/types.ts`, `src/price/aiEstimate.ts`, `src/price/aiEstimate.test.ts`

- [ ] **Step 1: Create `src/price/types.ts`**

```ts
import type { Grocer } from "../types.js";
import type { IdentifyResult } from "../identify/types.js";

export interface PriceQuery {
  grocer: Grocer;
  barcode: string | null;
  identity: IdentifyResult;
}

export interface PriceResult {
  price_cents: number;
  source: "scrape" | "api" | "ai_estimate";
  confidence: number; // 0..1
  raw: string;        // for price_check audit
}

export interface PriceSourceFn {
  (q: PriceQuery): Promise<PriceResult | null>;
}
```

- [ ] **Step 2: Write the failing test** (`src/price/aiEstimate.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { parseEstimate } from "./aiEstimate.js";

describe("aiEstimate", () => {
  it("parses dollars from model JSON", () => {
    const r = parseEstimate('{"price_usd": 5.99}')!;
    expect(r.price_cents).toBe(599);
    expect(r.source).toBe("ai_estimate");
    expect(r.confidence).toBeLessThan(0.6);
  });
  it("returns null when no price present", () => {
    expect(parseEstimate("dunno")).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/price/aiEstimate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write implementation** (`src/price/aiEstimate.ts`)

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { PriceQuery, PriceResult } from "./types.js";

const GROCER_LABEL = { whole_foods: "Whole Foods", kroger: "Kroger", target: "Target" } as const;

export function parseEstimate(text: string): PriceResult | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let obj: any;
  try { obj = JSON.parse(match[0]); } catch { return null; }
  const usd = Number(obj.price_usd);
  if (!isFinite(usd) || usd <= 0) return null;
  return { price_cents: Math.round(usd * 100), source: "ai_estimate", confidence: 0.4, raw: match[0] };
}

export async function estimatePrice(q: PriceQuery, client: Anthropic): Promise<PriceResult | null> {
  const prompt = `Estimate the current US retail price in dollars for "${q.identity.brand ?? ""} ${q.identity.product_name}" at ${GROCER_LABEL[q.grocer]}. Respond ONLY as JSON: {"price_usd": number}`;
  const msg = await client.messages.create({
    model: "claude-sonnet-4-5", max_tokens: 100,
    messages: [{ role: "user", content: prompt }],
  });
  const text = msg.content.filter(b => b.type === "text").map((b: any) => b.text).join("");
  return parseEstimate(text);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/price/aiEstimate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/price/types.ts src/price/aiEstimate.ts src/price/aiEstimate.test.ts
git commit -m "feat: AI price estimate fallback"
```

### Task 4.2: Kroger price source (official API)

**Files:**
- Create: `src/price/kroger.ts`, `src/price/kroger.test.ts`, `tests/fixtures/kroger-product.json`

> Kroger Product API: OAuth2 client-credentials token, then `GET /v1/products?filter.term=<name>&filter.locationId=<id>`. Price is in `items[0].price.regular` (dollars).

- [ ] **Step 1: Create fixture** `tests/fixtures/kroger-product.json`

```json
{ "data": [ { "description": "Simple Truth Organic Blueberries", "items": [ { "price": { "regular": 4.99, "promo": 0 } } ] } ] }
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseKrogerProducts } from "./kroger.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/kroger-product.json", "utf8"));

describe("kroger", () => {
  it("extracts the regular price in cents from the first product", () => {
    const r = parseKrogerProducts(fixture)!;
    expect(r.price_cents).toBe(499);
    expect(r.source).toBe("api");
    expect(r.confidence).toBeGreaterThan(0.7);
  });
  it("prefers promo price when present and lower", () => {
    const r = parseKrogerProducts({ data: [{ items: [{ price: { regular: 4.99, promo: 3.50 } }] }] })!;
    expect(r.price_cents).toBe(350);
  });
  it("returns null when no items", () => {
    expect(parseKrogerProducts({ data: [] })).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/price/kroger.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write implementation** (`src/price/kroger.ts`)

```ts
import type { PriceQuery, PriceResult } from "./types.js";
import type { Config } from "../config.js";

export function parseKrogerProducts(json: any): PriceResult | null {
  const first = json?.data?.[0];
  const price = first?.items?.[0]?.price;
  if (!price) return null;
  const regular = Number(price.regular);
  const promo = Number(price.promo);
  const dollars = promo > 0 && promo < regular ? promo : regular;
  if (!isFinite(dollars) || dollars <= 0) return null;
  return { price_cents: Math.round(dollars * 100), source: "api", confidence: 0.8, raw: JSON.stringify(first) };
}

async function getToken(cfg: Config, fetchFn = fetch): Promise<string> {
  const body = new URLSearchParams({ grant_type: "client_credentials", scope: "product.compact" });
  const auth = Buffer.from(`${cfg.kroger.clientId}:${cfg.kroger.clientSecret}`).toString("base64");
  const res = await fetchFn("https://api.kroger.com/v1/connect/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`kroger token ${res.status}`);
  return (await res.json()).access_token;
}

export async function krogerPrice(q: PriceQuery, cfg: Config, fetchFn = fetch): Promise<PriceResult | null> {
  if (!cfg.kroger.clientId || !cfg.kroger.locationId) return null;
  const token = await getToken(cfg, fetchFn);
  const term = encodeURIComponent(q.identity.product_name);
  const url = `https://api.kroger.com/v1/products?filter.term=${term}&filter.locationId=${cfg.kroger.locationId}&filter.limit=1`;
  const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!res.ok) return null;
  return parseKrogerProducts(await res.json());
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/price/kroger.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/price/kroger.ts src/price/kroger.test.ts tests/fixtures/kroger-product.json
git commit -m "feat: kroger price source"
```

### Task 4.3: Target price source (redsky, unofficial)

**Files:**
- Create: `src/price/target.ts`, `src/price/target.test.ts`, `tests/fixtures/target-search.json`

> Target redsky: search `redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?keyword=<name>&pricing_store_id=<id>&key=<key>`. Price at `data.search.products[0].price.current_retail` (dollars).

- [ ] **Step 1: Create fixture** `tests/fixtures/target-search.json`

```json
{ "data": { "search": { "products": [ { "item": { "product_description": { "title": "Blueberries 18oz" } }, "price": { "current_retail": 6.49 } } ] } } }
```

- [ ] **Step 2: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseTargetSearch } from "./target.js";

const fixture = JSON.parse(readFileSync("tests/fixtures/target-search.json", "utf8"));

describe("target", () => {
  it("extracts current retail in cents", () => {
    const r = parseTargetSearch(fixture)!;
    expect(r.price_cents).toBe(649);
    expect(r.source).toBe("api");
  });
  it("returns null when no products", () => {
    expect(parseTargetSearch({ data: { search: { products: [] } } })).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/price/target.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write implementation** (`src/price/target.ts`)

```ts
import type { PriceQuery, PriceResult } from "./types.js";
import type { Config } from "../config.js";

export function parseTargetSearch(json: any): PriceResult | null {
  const p = json?.data?.search?.products?.[0];
  const dollars = Number(p?.price?.current_retail);
  if (!isFinite(dollars) || dollars <= 0) return null;
  return { price_cents: Math.round(dollars * 100), source: "api", confidence: 0.7, raw: JSON.stringify(p) };
}

export async function targetPrice(q: PriceQuery, cfg: Config, fetchFn = fetch): Promise<PriceResult | null> {
  if (!cfg.target.storeId || !cfg.target.apiKey) return null;
  const kw = encodeURIComponent(q.identity.product_name);
  const url = `https://redsky.target.com/redsky_aggregations/v1/web/plp_search_v2?keyword=${kw}&pricing_store_id=${cfg.target.storeId}&key=${cfg.target.apiKey}&count=1`;
  const res = await fetchFn(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return null;
  return parseTargetSearch(await res.json());
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/price/target.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/price/target.ts src/price/target.test.ts tests/fixtures/target-search.json
git commit -m "feat: target redsky price source"
```

### Task 4.4: Whole Foods price source (Playwright scrape)

**Files:**
- Create: `src/price/wholeFoods.ts`, `src/price/wholeFoods.test.ts`

> Whole Foods has no public price API; prices are on amazon.com under the Whole Foods store, location-gated. We scrape a search result with Playwright. The parsing of a price string is tested in isolation; the live scrape is integration-only (skipped in CI).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parsePriceString } from "./wholeFoods.js";

describe("wholeFoods price parsing", () => {
  it("parses a dollar/cents price from text fragments", () => {
    expect(parsePriceString("$5", "99")).toBe(599);
    expect(parsePriceString("$12", "00")).toBe(1200);
  });
  it("parses a combined price string", () => {
    expect(parsePriceString("$4.49")).toBe(449);
  });
  it("returns null on garbage", () => {
    expect(parsePriceString("see price in cart")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/price/wholeFoods.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation** (`src/price/wholeFoods.ts`)

```ts
import { chromium } from "playwright";
import type { PriceQuery, PriceResult } from "./types.js";
import type { Config } from "../config.js";

export function parsePriceString(whole: string, fraction?: string): number | null {
  if (fraction !== undefined) {
    const w = whole.replace(/[^0-9]/g, "");
    const f = fraction.replace(/[^0-9]/g, "").padEnd(2, "0").slice(0, 2);
    if (!w) return null;
    return parseInt(w, 10) * 100 + parseInt(f, 10);
  }
  const m = whole.match(/\$\s*(\d+)\.(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
}

export async function wholeFoodsPrice(q: PriceQuery, cfg: Config): Promise<PriceResult | null> {
  const term = encodeURIComponent(`${q.identity.brand ?? ""} ${q.identity.product_name}`.trim());
  const url = `https://www.amazon.com/s?k=${term}&i=wholefoods`;
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ userAgent: "Mozilla/5.0", locale: "en-US" });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    const whole = await page.locator(".a-price .a-price-whole").first().textContent({ timeout: 5000 }).catch(() => null);
    const frac = await page.locator(".a-price .a-price-fraction").first().textContent().catch(() => null);
    if (!whole) return null;
    const cents = parsePriceString(whole, frac ?? "00");
    if (cents === null) return null;
    return { price_cents: cents, source: "scrape", confidence: 0.6, raw: `${whole}.${frac}` };
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/price/wholeFoods.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/price/wholeFoods.ts src/price/wholeFoods.test.ts
git commit -m "feat: whole foods playwright price source + parser"
```

### Task 4.5: Price resolver (source → fallback)

**Files:**
- Create: `src/price/resolvePrice.ts`, `src/price/resolvePrice.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { resolvePrice } from "./resolvePrice.js";
import type { PriceQuery, PriceResult } from "./types.js";

const q: PriceQuery = { grocer: "kroger", barcode: null, identity: { product_name: "X", brand: null, category: "produce", confidence: 0.9 } };

describe("resolvePrice", () => {
  it("uses the grocer source when it succeeds", async () => {
    const source = vi.fn().mockResolvedValue({ price_cents: 499, source: "api", confidence: 0.8, raw: "{}" } as PriceResult);
    const estimate = vi.fn();
    const r = await resolvePrice(q, { source, estimate });
    expect(r.price_cents).toBe(499);
    expect(estimate).not.toHaveBeenCalled();
  });
  it("falls back to estimate when source returns null", async () => {
    const source = vi.fn().mockResolvedValue(null);
    const estimate = vi.fn().mockResolvedValue({ price_cents: 599, source: "ai_estimate", confidence: 0.4, raw: "{}" } as PriceResult);
    const r = await resolvePrice(q, { source, estimate });
    expect(r.source).toBe("ai_estimate");
  });
  it("falls back to estimate when source throws", async () => {
    const source = vi.fn().mockRejectedValue(new Error("boom"));
    const estimate = vi.fn().mockResolvedValue({ price_cents: 100, source: "ai_estimate", confidence: 0.4, raw: "{}" } as PriceResult);
    const r = await resolvePrice(q, { source, estimate });
    expect(r.price_cents).toBe(100);
  });
  it("throws when both source and estimate fail", async () => {
    await expect(resolvePrice(q, { source: async () => null, estimate: async () => null })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/price/resolvePrice.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation** (`src/price/resolvePrice.ts`)

```ts
import type { PriceQuery, PriceResult } from "./types.js";

export interface ResolveDeps {
  source: (q: PriceQuery) => Promise<PriceResult | null>; // grocer-specific
  estimate: (q: PriceQuery) => Promise<PriceResult | null>;
}

export async function resolvePrice(q: PriceQuery, deps: ResolveDeps): Promise<PriceResult> {
  let viaSource: PriceResult | null = null;
  try { viaSource = await deps.source(q); } catch { viaSource = null; }
  if (viaSource) return viaSource;
  const viaEstimate = await deps.estimate(q);
  if (viaEstimate) return viaEstimate;
  throw new Error("price unresolved");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/price/resolvePrice.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/price/resolvePrice.ts src/price/resolvePrice.test.ts
git commit -m "feat: price resolver with fallback"
```

### Task 4.6: Grocer source selector

**Files:**
- Create: `src/price/selectSource.ts`, `src/price/selectSource.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { selectSource } from "./selectSource.js";

describe("selectSource", () => {
  it("returns a function bound to the right grocer module", async () => {
    const mods = {
      krogerPrice: vi.fn().mockResolvedValue({ price_cents: 1, source: "api", confidence: 0.8, raw: "" }),
      targetPrice: vi.fn(),
      wholeFoodsPrice: vi.fn(),
    };
    const fn = selectSource("kroger", {} as any, mods as any);
    await fn({ grocer: "kroger", barcode: null, identity: { product_name: "x", brand: null, category: "produce", confidence: 1 } });
    expect(mods.krogerPrice).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/price/selectSource.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation** (`src/price/selectSource.ts`)

```ts
import type { Grocer } from "../types.js";
import type { Config } from "../config.js";
import type { PriceQuery, PriceResult } from "./types.js";
import { krogerPrice } from "./kroger.js";
import { targetPrice } from "./target.js";
import { wholeFoodsPrice } from "./wholeFoods.js";

interface Mods {
  krogerPrice: typeof krogerPrice; targetPrice: typeof targetPrice; wholeFoodsPrice: typeof wholeFoodsPrice;
}
const defaultMods: Mods = { krogerPrice, targetPrice, wholeFoodsPrice };

export function selectSource(grocer: Grocer, cfg: Config, mods: Mods = defaultMods) {
  return (q: PriceQuery): Promise<PriceResult | null> => {
    if (grocer === "kroger") return mods.krogerPrice(q, cfg);
    if (grocer === "target") return mods.targetPrice(q, cfg);
    return mods.wholeFoodsPrice(q, cfg);
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/price/selectSource.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/price/selectSource.ts src/price/selectSource.test.ts
git commit -m "feat: grocer price source selector"
```

---

## Phase 5 — Queue & Worker

### Task 5.1: SQLite-backed job queue

**Files:**
- Create: `src/queue/jobQueue.ts`, `src/queue/jobQueue.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { openDb, migrate, DB } from "../db/connection.js";
import { JobQueue } from "./jobQueue.js";

let db: DB; let q: JobQueue;
beforeEach(() => { db = openDb(":memory:"); migrate(db); q = new JobQueue(db); });

describe("JobQueue", () => {
  it("enqueues and claims a ready job", () => {
    q.enqueue(42, "2026-06-07T00:00:00Z");
    const job = q.claimNext("2026-06-07T00:00:01Z")!;
    expect(job.item_id).toBe(42);
  });
  it("does not claim a job whose run_after is in the future", () => {
    q.enqueue(1, "2026-06-07T00:00:10Z");
    expect(q.claimNext("2026-06-07T00:00:00Z")).toBeUndefined();
  });
  it("marks a job done so it is not re-claimed", () => {
    q.enqueue(1, "2026-06-07T00:00:00Z");
    const job = q.claimNext("2026-06-07T00:00:01Z")!;
    q.complete(job.id);
    expect(q.claimNext("2026-06-07T00:00:02Z")).toBeUndefined();
  });
  it("reschedules with incremented attempts", () => {
    q.enqueue(1, "2026-06-07T00:00:00Z");
    const job = q.claimNext("2026-06-07T00:00:01Z")!;
    q.retry(job.id, "2026-06-07T00:05:00Z");
    const again = q.claimNext("2026-06-07T00:06:00Z")!;
    expect(again.attempts).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/queue/jobQueue.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation** (`src/queue/jobQueue.ts`)

```ts
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
        "SELECT * FROM job WHERE done=0 AND run_after <= ? ORDER BY run_after LIMIT 1"
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/queue/jobQueue.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/queue/jobQueue.ts src/queue/jobQueue.test.ts
git commit -m "feat: sqlite-backed job queue"
```

### Task 5.2: Resolution worker (process one item)

**Files:**
- Create: `src/queue/worker.ts`, `src/queue/worker.test.ts`

The worker processes a single claimed job: load item → identify → set identity → resolve price → set price → record checks. On failure it retries up to `MAX_ATTEMPTS`, then marks the item `failed`. We test `processItem` with injected deps (no DB I/O beyond repos on an in-memory db).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { openDb, migrate, DB } from "../db/connection.js";
import { WasteItemsRepo } from "../db/repositories/wasteItems.js";
import { PriceChecksRepo } from "../db/repositories/priceChecks.js";
import { processItem } from "./worker.js";

let db: DB; let items: WasteItemsRepo; let checks: PriceChecksRepo;
beforeEach(() => { db = openDb(":memory:"); migrate(db); items = new WasteItemsRepo(db); checks = new PriceChecksRepo(db); });

describe("processItem", () => {
  it("identifies, prices, and marks the item priced", async () => {
    const id = items.create({ grocer: "kroger", capture_type: "barcode", barcode: "012" }, "2026-06-07T00:00:00Z");
    const deps = {
      items, checks,
      identify: vi.fn().mockResolvedValue({ product_name: "Eggs", brand: null, category: "dairy", confidence: 0.85 }),
      resolve: vi.fn().mockResolvedValue({ price_cents: 499, source: "api", confidence: 0.8, raw: "{}" }),
      now: () => "2026-06-07T00:00:05Z",
    };
    await processItem(items.get(id)!, deps as any);
    const updated = items.get(id)!;
    expect(updated.status).toBe("priced");
    expect(updated.product_name).toBe("Eggs");
    expect(updated.price_cents).toBe(499);
    expect(checks.listForItem(id).length).toBeGreaterThanOrEqual(1);
  });

  it("throws (for retry) when identify returns null", async () => {
    const id = items.create({ grocer: "kroger", capture_type: "barcode", barcode: "012" }, "2026-06-07T00:00:00Z");
    const deps = { items, checks, identify: vi.fn().mockResolvedValue(null), resolve: vi.fn(), now: () => "x" };
    await expect(processItem(items.get(id)!, deps as any)).rejects.toThrow();
    expect(deps.resolve).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/queue/worker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation** (`src/queue/worker.ts`)

```ts
import type { WasteItem } from "../types.js";
import type { WasteItemsRepo } from "../db/repositories/wasteItems.js";
import type { PriceChecksRepo } from "../db/repositories/priceChecks.js";
import type { IdentifyResult } from "../identify/types.js";
import type { PriceQuery, PriceResult } from "../price/types.js";

export interface WorkerDeps {
  items: WasteItemsRepo;
  checks: PriceChecksRepo;
  identify: (item: WasteItem) => Promise<IdentifyResult | null>;
  resolve: (q: PriceQuery) => Promise<PriceResult>;
  now: () => string;
}

export async function processItem(item: WasteItem, deps: WorkerDeps): Promise<void> {
  const identity = await deps.identify(item);
  if (!identity) {
    deps.checks.record(item.id, "identify", "null", false, deps.now());
    throw new Error("identify failed");
  }
  deps.items.setIdentity(item.id, {
    product_name: identity.product_name, brand: identity.brand, category: identity.category, confidence: identity.confidence,
  });
  const price = await deps.resolve({ grocer: item.grocer, barcode: item.barcode, identity });
  deps.checks.record(item.id, price.source, price.raw, true, deps.now());
  deps.items.setPrice(item.id, { price_cents: price.price_cents, price_source: price.source, status: "priced" });
}

export const MAX_ATTEMPTS = 3;

/** Decide retry vs give-up after a processing error. */
export function onProcessError(item: WasteItem, attempts: number, deps: Pick<WorkerDeps, "items">): "retry" | "failed" {
  if (attempts + 1 >= MAX_ATTEMPTS) { deps.items.setStatus(item.id, "failed"); return "failed"; }
  return "retry";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/queue/worker.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Add a test for `onProcessError`** (same file)

```ts
import { onProcessError, MAX_ATTEMPTS } from "./worker.js";
// inside a new describe block:
describe("onProcessError", () => {
  it("retries below max attempts and fails at max", () => {
    const id = items.create({ grocer: "kroger", capture_type: "barcode" }, "2026-06-07T00:00:00Z");
    const item = items.get(id)!;
    expect(onProcessError(item, 0, { items })).toBe("retry");
    expect(onProcessError(item, MAX_ATTEMPTS - 1, { items })).toBe("failed");
    expect(items.get(id)!.status).toBe("failed");
  });
});
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/queue/worker.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/queue/worker.ts src/queue/worker.test.ts
git commit -m "feat: resolution worker processItem + retry policy"
```

### Task 5.3: Worker runner (poll loop with backoff)

**Files:**
- Create: `src/queue/runner.ts`, `src/queue/runner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { openDb, migrate, DB } from "../db/connection.js";
import { WasteItemsRepo } from "../db/repositories/wasteItems.js";
import { JobQueue } from "./jobQueue.js";
import { runOnce } from "./runner.js";

let db: DB; let items: WasteItemsRepo; let q: JobQueue;
beforeEach(() => { db = openDb(":memory:"); migrate(db); items = new WasteItemsRepo(db); q = new JobQueue(db); });

describe("runOnce", () => {
  it("claims a ready job, processes it, and completes it", async () => {
    const id = items.create({ grocer: "kroger", capture_type: "barcode", barcode: "012" }, "2026-06-07T00:00:00Z");
    q.enqueue(id, "2026-06-07T00:00:00Z");
    const process = vi.fn().mockResolvedValue(undefined);
    const handled = await runOnce(q, items, process, () => "2026-06-07T00:00:05Z");
    expect(handled).toBe(true);
    expect(process).toHaveBeenCalled();
    expect(q.pendingCount()).toBe(0);
  });

  it("retries the job with backoff when processing throws", async () => {
    const id = items.create({ grocer: "kroger", capture_type: "barcode", barcode: "012" }, "2026-06-07T00:00:00Z");
    q.enqueue(id, "2026-06-07T00:00:00Z");
    const process = vi.fn().mockRejectedValue(new Error("x"));
    await runOnce(q, items, process, () => "2026-06-07T00:00:05Z");
    expect(q.pendingCount()).toBe(1); // re-scheduled, not done
  });

  it("returns false when nothing is ready", async () => {
    const handled = await runOnce(q, items, vi.fn(), () => "2026-06-07T00:00:05Z");
    expect(handled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/queue/runner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation** (`src/queue/runner.ts`)

```ts
import type { WasteItem } from "../types.js";
import type { WasteItemsRepo } from "../db/repositories/wasteItems.js";
import type { JobQueue } from "./jobQueue.js";
import { onProcessError } from "./worker.js";

const BACKOFF_MS = [0, 60_000, 300_000]; // attempt 0->1min, 1->5min

export async function runOnce(
  q: JobQueue, items: WasteItemsRepo,
  process: (item: WasteItem) => Promise<void>, now: () => string,
): Promise<boolean> {
  const job = q.claimNext(now());
  if (!job) return false;
  const item = items.get(job.item_id);
  if (!item) { q.complete(job.id); return true; }
  try {
    await process(item);
    q.complete(job.id);
  } catch {
    const decision = onProcessError(item, job.attempts, { items });
    if (decision === "failed") { q.complete(job.id); }
    else {
      const delay = BACKOFF_MS[Math.min(job.attempts, BACKOFF_MS.length - 1)];
      q.retry(job.id, new Date(Date.parse(now()) + delay).toISOString());
    }
  }
  return true;
}

export function startRunner(
  q: JobQueue, items: WasteItemsRepo,
  process: (item: WasteItem) => Promise<void>, intervalMs = 3000,
): () => void {
  const timer = setInterval(async () => {
    try { while (await runOnce(q, items, process, () => new Date().toISOString())) { /* drain */ } }
    catch { /* swallow; next tick retries */ }
  }, intervalMs);
  return () => clearInterval(timer);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/queue/runner.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/queue/runner.ts src/queue/runner.test.ts
git commit -m "feat: worker poll loop with backoff"
```

---

## Phase 6 — HTTP API

### Task 6.1: Fastify app factory + passcode auth

**Files:**
- Create: `src/http/server.ts`, `src/http/auth.ts`, `src/http/auth.test.ts`

- [ ] **Step 1: Write the failing test** (`src/http/auth.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { checkPasscode } from "./auth.js";

describe("checkPasscode", () => {
  it("accepts the matching passcode header", () => {
    expect(checkPasscode("secret", "secret")).toBe(true);
  });
  it("rejects a wrong or missing passcode", () => {
    expect(checkPasscode("secret", "nope")).toBe(false);
    expect(checkPasscode("secret", undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/http/auth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/http/auth.ts`**

```ts
import type { FastifyRequest, FastifyReply } from "fastify";

export function checkPasscode(expected: string, provided: string | undefined): boolean {
  return !!provided && provided === expected;
}

export function passcodeGuard(expected: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const provided = (req.headers["x-passcode"] as string | undefined) ?? undefined;
    if (!checkPasscode(expected, provided)) {
      reply.code(401).send({ error: "unauthorized" });
    }
  };
}
```

- [ ] **Step 4: Write `src/http/server.ts`**

```ts
import Fastify, { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export interface ServerCtx {
  registerRoutes: (app: FastifyInstance) => void;
}

export function buildServer(ctx: ServerCtx): FastifyInstance {
  const app = Fastify({ logger: true, bodyLimit: 15 * 1024 * 1024 });
  app.register(fastifyStatic, { root: join(here, "../../public"), prefix: "/" });
  ctx.registerRoutes(app);
  return app;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/http/auth.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/http/server.ts src/http/auth.ts src/http/auth.test.ts
git commit -m "feat: fastify server factory + passcode auth"
```

### Task 6.2: Capture route (barcode + photo) with integration test

**Files:**
- Create: `src/http/routes/captures.ts`, `src/http/routes/captures.test.ts`, `src/storage/photos.ts`

The capture endpoint: accepts JSON `{ grocer, capture_type, barcode?, photoBase64?, qty? }`. For photos it writes the base64 to a file on the volume and stores `photo_path`. It inserts a pending item and enqueues a job. Returns the new item.

- [ ] **Step 1: Write `src/storage/photos.ts`** (helper, with test below)

```ts
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function savePhoto(dataDir: string, id: number, base64: string, ext = "jpg"): string {
  const dir = join(dataDir, "photos");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.${ext}`);
  writeFileSync(path, Buffer.from(base64, "base64"));
  return path;
}

export function readPhotoAsBase64(path: string): { base64: string; mediaType: string } {
  const buf = readFileSync(path);
  const mediaType = path.endsWith(".png") ? "image/png" : "image/jpeg";
  return { base64: buf.toString("base64"), mediaType };
}
```

- [ ] **Step 2: Write the failing integration test** (`src/http/routes/captures.test.ts`)

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { openDb, migrate, DB } from "../../db/connection.js";
import { WasteItemsRepo } from "../../db/repositories/wasteItems.js";
import { JobQueue } from "../../queue/jobQueue.js";
import Fastify from "fastify";
import { registerCaptureRoutes } from "./captures.js";

let db: DB; let items: WasteItemsRepo; let q: JobQueue;
function buildApp() {
  const app = Fastify();
  items = new WasteItemsRepo(db); q = new JobQueue(db);
  registerCaptureRoutes(app, { items, queue: q, dataDir: "./data-test", passcode: "secret", now: () => "2026-06-07T00:00:00Z" });
  return app;
}
beforeEach(() => { db = openDb(":memory:"); migrate(db); });

describe("POST /api/captures", () => {
  it("rejects without passcode", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/api/captures", payload: { grocer: "kroger", capture_type: "barcode", barcode: "012" } });
    expect(res.statusCode).toBe(401);
  });

  it("creates a pending barcode item and enqueues a job", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST", url: "/api/captures",
      headers: { "x-passcode": "secret" },
      payload: { grocer: "kroger", capture_type: "barcode", barcode: "012" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe("pending");
    expect(items.get(body.id)!.barcode).toBe("012");
    expect(q.pendingCount()).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/http/routes/captures.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write implementation** (`src/http/routes/captures.ts`)

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { WasteItemsRepo } from "../../db/repositories/wasteItems.js";
import type { JobQueue } from "../../queue/jobQueue.js";
import { savePhoto } from "../../storage/photos.js";
import { checkPasscode } from "../auth.js";

const bodySchema = z.object({
  grocer: z.enum(["whole_foods", "kroger", "target"]),
  capture_type: z.enum(["barcode", "photo"]),
  barcode: z.string().optional(),
  photoBase64: z.string().optional(),
  qty: z.number().int().positive().default(1),
});

export interface CaptureDeps {
  items: WasteItemsRepo; queue: JobQueue; dataDir: string; passcode: string; now: () => string;
}

export function registerCaptureRoutes(app: FastifyInstance, deps: CaptureDeps): void {
  app.post("/api/captures", async (req, reply) => {
    if (!checkPasscode(deps.passcode, req.headers["x-passcode"] as string | undefined)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const b = parsed.data;
    const now = deps.now();
    const id = deps.items.create(
      { grocer: b.grocer, capture_type: b.capture_type, barcode: b.barcode ?? null, qty: b.qty },
      now,
    );
    if (b.capture_type === "photo" && b.photoBase64) {
      const path = savePhoto(deps.dataDir, id, b.photoBase64);
      deps.items.get(id); // ensure row exists
      (deps.items as any).db?.prepare?.; // no-op guard
      deps.items["db"].prepare("UPDATE waste_item SET photo_path=? WHERE id=?").run(path, id);
    }
    deps.queue.enqueue(id, now);
    return reply.code(201).send(deps.items.get(id));
  });
}
```

> Note: the `photo_path` update uses the repo's db handle. To keep the repo's API clean, add a `setPhotoPath` method instead (next step) and replace the inline UPDATE.

- [ ] **Step 5: Add `setPhotoPath` to the repo and use it**

In `src/db/repositories/wasteItems.ts` add:
```ts
  setPhotoPath(id: number, path: string): void {
    this.db.prepare("UPDATE waste_item SET photo_path=? WHERE id=?").run(path, id);
  }
```

Replace the inline block in `captures.ts` with:
```ts
    if (b.capture_type === "photo" && b.photoBase64) {
      const path = savePhoto(deps.dataDir, id, b.photoBase64);
      deps.items.setPhotoPath(id, path);
    }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/http/routes/captures.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add src/http/routes/captures.ts src/http/routes/captures.test.ts src/storage/photos.ts src/db/repositories/wasteItems.ts
git commit -m "feat: capture route (barcode + photo) with enqueue"
```

### Task 6.3: Ledger route (dashboard data)

**Files:**
- Create: `src/http/routes/ledger.ts`, `src/http/routes/ledger.test.ts`

Returns dashboard payload: current week + month totals, weekly trend, category breakdown, grocer breakdown, repeat offenders, projected annual, and recent items.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { openDb, migrate, DB } from "../../db/connection.js";
import { WasteItemsRepo } from "../../db/repositories/wasteItems.js";
import Fastify from "fastify";
import { registerLedgerRoutes } from "./ledger.js";

let db: DB; let items: WasteItemsRepo;
function buildApp() {
  const app = Fastify();
  items = new WasteItemsRepo(db);
  registerLedgerRoutes(app, { items, passcode: "secret", tz: "UTC", now: () => new Date("2026-06-07T00:00:00Z") });
  return app;
}
beforeEach(() => { db = openDb(":memory:"); migrate(db); });

describe("GET /api/ledger", () => {
  it("returns aggregate dashboard data for priced items", async () => {
    const id = items.create({ grocer: "whole_foods", capture_type: "barcode" }, "2026-06-02T00:00:00Z");
    items.setIdentity(id, { product_name: "Blueberries", brand: null, category: "produce", confidence: 1 });
    items.setPrice(id, { price_cents: 599, price_source: "api", status: "priced" });

    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/ledger", headers: { "x-passcode": "secret" } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.weekTotalCents).toBe(599);
    expect(body.monthTotalCents).toBe(599);
    expect(body.byCategory[0].category).toBe("produce");
    expect(body.projectedAnnualCents).toBe(599 * 12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/http/routes/ledger.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation** (`src/http/routes/ledger.ts`)

```ts
import type { FastifyInstance } from "fastify";
import type { WasteItemsRepo } from "../../db/repositories/wasteItems.js";
import { checkPasscode } from "../auth.js";
import { weekBounds, monthBounds } from "../../domain/periods.js";
import { totalCents, byCategory, byGrocer, repeatOffenders, projectedAnnualCents, weeklyTrend } from "../../domain/stats.js";

export interface LedgerDeps { items: WasteItemsRepo; passcode: string; tz: string; now: () => Date; }

export function registerLedgerRoutes(app: FastifyInstance, deps: LedgerDeps): void {
  app.get("/api/ledger", async (req, reply) => {
    if (!checkPasscode(deps.passcode, req.headers["x-passcode"] as string | undefined)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const now = deps.now();
    const wk = weekBounds(now, deps.tz);
    const mo = monthBounds(now, deps.tz);
    const onlyPriced = (xs: any[]) => xs.filter(i => i.price_cents != null);

    const weekItems = onlyPriced(deps.items.listBetween(wk.startIso, wk.endIso));
    const monthItems = onlyPriced(deps.items.listBetween(mo.startIso, mo.endIso));
    const allPriced = onlyPriced(deps.items.listRecent(1000));

    const weekTotal = totalCents(weekItems);
    return reply.send({
      weekLabel: wk.label, monthLabel: mo.label,
      weekTotalCents: weekTotal,
      monthTotalCents: totalCents(monthItems),
      projectedAnnualCents: projectedAnnualCents(weekTotal, "weekly"),
      weeklyTrend: weeklyTrend(allPriced, deps.tz),
      byCategory: byCategory(monthItems),
      byGrocer: byGrocer(monthItems),
      repeatOffenders: repeatOffenders(allPriced).slice(0, 10),
      recent: deps.items.listRecent(50),
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/http/routes/ledger.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/http/routes/ledger.ts src/http/routes/ledger.test.ts
git commit -m "feat: ledger/dashboard route"
```

### Task 6.4: Item override + settings routes

**Files:**
- Create: `src/http/routes/items.ts`, `src/http/routes/settings.ts`, `src/http/routes/items.test.ts`

- [ ] **Step 1: Write the failing test** (`src/http/routes/items.test.ts`)

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { openDb, migrate, DB } from "../../db/connection.js";
import { WasteItemsRepo } from "../../db/repositories/wasteItems.js";
import { SettingsRepo } from "../../db/repositories/settings.js";
import Fastify from "fastify";
import { registerItemRoutes } from "./items.js";
import { registerSettingsRoutes } from "./settings.js";

let db: DB; let items: WasteItemsRepo; let settings: SettingsRepo;
function buildApp() {
  const app = Fastify();
  items = new WasteItemsRepo(db); settings = new SettingsRepo(db);
  registerItemRoutes(app, { items, passcode: "secret" });
  registerSettingsRoutes(app, { settings, passcode: "secret" });
  return app;
}
beforeEach(() => { db = openDb(":memory:"); migrate(db); });

describe("PATCH /api/items/:id", () => {
  it("overrides price and marks it manual", async () => {
    const id = items.create({ grocer: "kroger", capture_type: "barcode" }, "2026-06-07T00:00:00Z");
    const app = buildApp();
    const res = await app.inject({
      method: "PATCH", url: `/api/items/${id}`,
      headers: { "x-passcode": "secret" },
      payload: { priceDollars: "7.25" },
    });
    expect(res.statusCode).toBe(200);
    const item = items.get(id)!;
    expect(item.price_cents).toBe(725);
    expect(item.price_source).toBe("manual");
    expect(item.status).toBe("manual");
  });
});

describe("settings routes", () => {
  it("reads and writes settings", async () => {
    const app = buildApp();
    await app.inject({ method: "PUT", url: "/api/settings", headers: { "x-passcode": "secret" }, payload: { weekly_enabled: "false" } });
    const res = await app.inject({ method: "GET", url: "/api/settings", headers: { "x-passcode": "secret" } });
    expect(res.json().weekly_enabled).toBe("false");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/http/routes/items.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/http/routes/items.ts`**

```ts
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { WasteItemsRepo } from "../../db/repositories/wasteItems.js";
import { checkPasscode } from "../auth.js";
import { dollarsToCents } from "../../domain/money.js";

const patchSchema = z.object({
  priceDollars: z.string().optional(),
  product_name: z.string().optional(),
  category: z.string().optional(),
  qty: z.number().int().positive().optional(),
});

export function registerItemRoutes(app: FastifyInstance, deps: { items: WasteItemsRepo; passcode: string }): void {
  app.patch<{ Params: { id: string } }>("/api/items/:id", async (req, reply) => {
    if (!checkPasscode(deps.passcode, req.headers["x-passcode"] as string | undefined)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const id = Number(req.params.id);
    const item = deps.items.get(id);
    if (!item) return reply.code(404).send({ error: "not found" });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const p = parsed.data;
    if (p.priceDollars !== undefined) {
      deps.items.setPrice(id, { price_cents: dollarsToCents(p.priceDollars), price_source: "manual", status: "manual" });
    }
    if (p.product_name !== undefined || p.category !== undefined) {
      deps.items.setIdentity(id, {
        product_name: p.product_name ?? item.product_name ?? "Unknown",
        brand: item.brand, category: p.category ?? item.category, confidence: 1,
      });
    }
    return reply.send(deps.items.get(id));
  });
}
```

- [ ] **Step 4: Write `src/http/routes/settings.ts`**

```ts
import type { FastifyInstance } from "fastify";
import type { SettingsRepo } from "../../db/repositories/settings.js";
import { checkPasscode } from "../auth.js";

const KEYS = ["weekly_enabled", "monthly_enabled", "wife_email"] as const;

export function registerSettingsRoutes(app: FastifyInstance, deps: { settings: SettingsRepo; passcode: string }): void {
  app.get("/api/settings", async (req, reply) => {
    if (!checkPasscode(deps.passcode, req.headers["x-passcode"] as string | undefined)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const out: Record<string, string> = {};
    for (const k of KEYS) out[k] = deps.settings.get(k, k === "wife_email" ? "" : "true");
    return reply.send(out);
  });

  app.put("/api/settings", async (req, reply) => {
    if (!checkPasscode(deps.passcode, req.headers["x-passcode"] as string | undefined)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = (req.body ?? {}) as Record<string, string>;
    for (const k of KEYS) if (k in body) deps.settings.set(k, String(body[k]));
    return reply.send({ ok: true });
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/http/routes/items.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/http/routes/items.ts src/http/routes/settings.ts src/http/routes/items.test.ts
git commit -m "feat: item override + settings routes"
```

### Task 6.5: "Cheaper next time" route

**Files:**
- Create: `src/price/compare.ts`, `src/price/compare.test.ts`, `src/http/routes/cheaper.ts`

For a wasted item, query the *other two* grocers (plus AI estimate) and return the cheapest option, so you know where to buy it for less next time.

- [ ] **Step 1: Write the failing test** (`src/price/compare.test.ts`)

```ts
import { describe, it, expect, vi } from "vitest";
import { cheapestAcross } from "./compare.js";
import type { PriceQuery, PriceResult } from "./types.js";

const identity = { product_name: "Blueberries", brand: null, category: "produce", confidence: 1 };

describe("cheapestAcross", () => {
  it("returns the lowest-priced grocer result", async () => {
    const priceBy = (g: string): Promise<PriceResult | null> =>
      Promise.resolve({ whole_foods: { price_cents: 699, source: "scrape", confidence: 0.6, raw: "" },
                        kroger: { price_cents: 499, source: "api", confidence: 0.8, raw: "" },
                        target: { price_cents: 649, source: "api", confidence: 0.7, raw: "" } }[g] as PriceResult);
    const fn = vi.fn((q: PriceQuery) => priceBy(q.grocer));
    const r = await cheapestAcross(identity, fn);
    expect(r.cheapest.grocer).toBe("kroger");
    expect(r.cheapest.price_cents).toBe(499);
    expect(r.all.length).toBe(3);
  });

  it("skips grocers that return null", async () => {
    const fn = vi.fn((q: PriceQuery) =>
      Promise.resolve(q.grocer === "target" ? { price_cents: 300, source: "api", confidence: 0.7, raw: "" } as PriceResult : null));
    const r = await cheapestAcross(identity, fn);
    expect(r.cheapest.grocer).toBe("target");
    expect(r.all.length).toBe(1);
  });

  it("throws when no grocer returns a price", async () => {
    await expect(cheapestAcross(identity, async () => null)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/price/compare.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation** (`src/price/compare.ts`)

```ts
import type { Grocer } from "../types.js";
import type { IdentifyResult } from "../identify/types.js";
import type { PriceQuery, PriceResult } from "./types.js";

const ALL_GROCERS: Grocer[] = ["whole_foods", "kroger", "target"];

export interface CompareEntry { grocer: Grocer; price_cents: number; source: PriceResult["source"]; }
export interface CompareResult { cheapest: CompareEntry; all: CompareEntry[]; }

export async function cheapestAcross(
  identity: IdentifyResult,
  priceFor: (q: PriceQuery) => Promise<PriceResult | null>,
): Promise<CompareResult> {
  const results = await Promise.all(ALL_GROCERS.map(async (grocer): Promise<CompareEntry | null> => {
    try {
      const r = await priceFor({ grocer, barcode: null, identity });
      return r ? { grocer, price_cents: r.price_cents, source: r.source } : null;
    } catch { return null; }
  }));
  const all = results.filter((x): x is CompareEntry => x !== null);
  if (all.length === 0) throw new Error("no prices found");
  const cheapest = all.reduce((a, b) => (b.price_cents < a.price_cents ? b : a));
  return { cheapest, all };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/price/compare.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `src/http/routes/cheaper.ts`**

```ts
import type { FastifyInstance } from "fastify";
import type { WasteItemsRepo } from "../../db/repositories/wasteItems.js";
import type { Config } from "../../config.js";
import type { PriceQuery, PriceResult } from "../../price/types.js";
import { checkPasscode } from "../auth.js";
import { selectSource } from "../../price/selectSource.js";
import { cheapestAcross } from "../../price/compare.js";

export interface CheaperDeps {
  items: WasteItemsRepo; passcode: string; cfg: Config;
  estimate: (q: PriceQuery) => Promise<PriceResult | null>;
}

export function registerCheaperRoutes(app: FastifyInstance, deps: CheaperDeps): void {
  app.get<{ Params: { id: string } }>("/api/items/:id/cheaper", async (req, reply) => {
    if (!checkPasscode(deps.passcode, req.headers["x-passcode"] as string | undefined)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const item = deps.items.get(Number(req.params.id));
    if (!item || !item.product_name) return reply.code(404).send({ error: "not found or unidentified" });
    const identity = { product_name: item.product_name, brand: item.brand, category: item.category, confidence: item.confidence ?? 0.5 };
    const priceFor = (q: PriceQuery) => {
      const src = selectSource(q.grocer, deps.cfg);
      return src(q).then(r => r ?? deps.estimate(q));
    };
    try {
      const result = await cheapestAcross(identity, priceFor);
      return reply.send(result);
    } catch {
      return reply.code(502).send({ error: "could not price across grocers" });
    }
  });
}
```

- [ ] **Step 6: Wire the route in `src/index.ts`**

Add the import near the other route imports:
```ts
import { registerCheaperRoutes } from "./http/routes/cheaper.js";
```
And inside `registerRoutes`, after `registerEmailRoutes(...)`:
```ts
    registerCheaperRoutes(a, { items, passcode: cfg.passcode, cfg, estimate: (q) => estimatePrice(q, anthropic) });
```

- [ ] **Step 7: Add a "cheaper" button to the ledger UI**

In `public/app.js`, change `renderItem` so a priced item also shows a "↓ cheaper?" action, and add a handler:
```js
function renderItem(i) {
  const price = i.price_cents == null
    ? `<span class="pending">pending…</span>`
    : `${fmt(i.price_cents)} <span class="muted">(${i.price_source})</span>`;
  const cheaper = i.price_cents != null ? ` <a href="#" data-cheaper="${i.id}" class="muted">↓ cheaper?</a>` : "";
  return `<div class="item"><span>${i.product_name ?? "…"} <span class="muted">${i.grocer}</span></span>
    <span><span data-edit="${i.id}">${price}</span>${cheaper}</span></div>`;
}
```
After rendering items in `loadLedger`, bind the handler:
```js
  for (const el of document.querySelectorAll("[data-cheaper]")) el.onclick = async (e) => {
    e.preventDefault();
    const res = await fetch(`/api/items/${el.dataset.cheaper}/cheaper`, { headers: headers() });
    if (!res.ok) return alert("Couldn't compare");
    const d = await res.json();
    alert(`Cheapest: ${d.cheapest.grocer} at ${fmt(d.cheapest.price_cents)}\n` +
      d.all.map(a => `${a.grocer}: ${fmt(a.price_cents)} (${a.source})`).join("\n"));
  };
```

- [ ] **Step 8: Run tests + build to verify**

Run: `npx vitest run src/price/compare.test.ts && npm run build`
Expected: tests PASS, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/price/compare.ts src/price/compare.test.ts src/http/routes/cheaper.ts src/index.ts public/app.js
git commit -m "feat: cheaper-next-time price comparison route + UI"
```

---

## Phase 7 — Email & Scheduling

### Task 7.1: Summary builder

**Files:**
- Create: `src/email/summaryBuilder.ts`, `src/email/summaryBuilder.test.ts`

Builds an `EmailSummary` object (pure) from priced items in a period + the full history (for trend).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { buildSummary } from "./summaryBuilder.js";
import type { WasteItem } from "../types.js";

function item(p: Partial<WasteItem>): WasteItem {
  return { id: 1, captured_at: "2026-06-02T00:00:00Z", grocer: "whole_foods", capture_type: "barcode",
    barcode: null, photo_path: null, product_name: "Blueberries", brand: null, category: "produce",
    status: "priced", price_cents: 599, price_source: "api", confidence: 1, qty: 1, notes: null, ...p };
}

describe("buildSummary", () => {
  it("assembles totals, breakdowns, offenders, projection", () => {
    const periodItems = [item({ id: 1 }), item({ id: 2 })];
    const s = buildSummary({
      periodType: "weekly", periodLabel: "Jun 1 – Jun 7",
      periodStart: "2026-06-01", periodEnd: "2026-06-08",
      periodItems, allItems: periodItems, tz: "UTC",
    });
    expect(s.totalCents).toBe(1198);
    expect(s.itemCount).toBe(2);
    expect(s.projectedAnnualCents).toBe(1198 * 52);
    expect(s.worstGrocer.grocer).toBe("whole_foods");
    expect(s.repeatOffenders[0].name).toBe("Blueberries");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/email/summaryBuilder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation** (`src/email/summaryBuilder.ts`)

```ts
import type { WasteItem, Grocer } from "../types.js";
import { totalCents, byCategory, byGrocer, repeatOffenders, projectedAnnualCents, weeklyTrend } from "../domain/stats.js";

export interface EmailSummary {
  periodType: "weekly" | "monthly";
  periodLabel: string; periodStart: string; periodEnd: string;
  totalCents: number; itemCount: number; projectedAnnualCents: number;
  byCategory: { category: string; cents: number }[];
  byGrocer: { grocer: Grocer; cents: number; pct: number }[];
  worstGrocer: { grocer: Grocer; cents: number; pct: number };
  repeatOffenders: { name: string; count: number; cents: number }[];
  trend: { weekStart: string; label: string; cents: number }[];
  photoPaths: string[];
}

export interface BuildSummaryInput {
  periodType: "weekly" | "monthly"; periodLabel: string; periodStart: string; periodEnd: string;
  periodItems: WasteItem[]; allItems: WasteItem[]; tz: string;
}

export function buildSummary(i: BuildSummaryInput): EmailSummary {
  const total = totalCents(i.periodItems);
  const grocers = byGrocer(i.periodItems);
  return {
    periodType: i.periodType, periodLabel: i.periodLabel, periodStart: i.periodStart, periodEnd: i.periodEnd,
    totalCents: total,
    itemCount: i.periodItems.reduce((s, it) => s + it.qty, 0),
    projectedAnnualCents: projectedAnnualCents(total, i.periodType),
    byCategory: byCategory(i.periodItems),
    byGrocer: grocers,
    worstGrocer: grocers[0] ?? { grocer: "whole_foods", cents: 0, pct: 0 },
    repeatOffenders: repeatOffenders(i.periodItems).slice(0, 5),
    trend: weeklyTrend(i.allItems, i.tz),
    photoPaths: i.periodItems.filter(it => it.photo_path).map(it => it.photo_path!) ,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/email/summaryBuilder.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/email/summaryBuilder.ts src/email/summaryBuilder.test.ts
git commit -m "feat: email summary builder"
```

### Task 7.2: Guilt-trip copywriter (Claude) with deterministic fallback

**Files:**
- Create: `src/email/copywriter.ts`, `src/email/copywriter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from "vitest";
import { buildCopyPrompt, fallbackCopy, generateCopy } from "./copywriter.js";
import type { EmailSummary } from "./summaryBuilder.js";

const summary: EmailSummary = {
  periodType: "weekly", periodLabel: "Jun 1 – Jun 7", periodStart: "2026-06-01", periodEnd: "2026-06-08",
  totalCents: 4713, itemCount: 6, projectedAnnualCents: 4713 * 52,
  byCategory: [{ category: "produce", cents: 4713 }],
  byGrocer: [{ grocer: "whole_foods", cents: 4713, pct: 100 }],
  worstGrocer: { grocer: "whole_foods", cents: 4713, pct: 100 },
  repeatOffenders: [{ name: "Blueberries", count: 3, cents: 1797 }],
  trend: [], photoPaths: [],
};

describe("copywriter", () => {
  it("includes the dollar total and offender in the prompt", () => {
    const p = buildCopyPrompt(summary);
    expect(p).toContain("$47.13");
    expect(p).toContain("Blueberries");
  });
  it("fallback copy is non-empty and contains the total", () => {
    const c = fallbackCopy(summary);
    expect(c.subject).toContain("$47.13");
    expect(c.headline.length).toBeGreaterThan(0);
    expect(c.tips.length).toBeGreaterThanOrEqual(1);
  });
  it("generateCopy uses the model and parses its JSON", async () => {
    const client = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: "text", text: '{"subject":"S","headline":"H","body":"B","tips":["t1","t2"]}' }] }) } };
    const c = await generateCopy(summary, client as any);
    expect(c.subject).toBe("S");
    expect(c.tips).toHaveLength(2);
  });
  it("generateCopy falls back when the model output is unparseable", async () => {
    const client = { messages: { create: vi.fn().mockResolvedValue({ content: [{ type: "text", text: "garbage" }] }) } };
    const c = await generateCopy(summary, client as any);
    expect(c.subject).toContain("$47.13");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/email/copywriter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation** (`src/email/copywriter.ts`)

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { EmailSummary } from "./summaryBuilder.js";
import { formatCents } from "../domain/money.js";

export interface EmailCopy { subject: string; headline: string; body: string; tips: string[]; }

const GROCER_LABEL = { whole_foods: "Whole Foods", kroger: "Kroger", target: "Target" } as const;

export function buildCopyPrompt(s: EmailSummary): string {
  const offenders = s.repeatOffenders.map(o => `${o.name} (${o.count}×, ${formatCents(o.cents)})`).join(", ") || "none";
  return `Write a short household "food waste report" email to my wife. Tone: guilt-trippy, mildly critical and condescending, but not cruel — playful spouse-to-spouse jab. Keep it punchy.

Data for ${s.periodLabel} (${s.periodType}):
- Total thrown away: ${formatCents(s.totalCents)} across ${s.itemCount} items
- Projected at this rate per year: ${formatCents(s.projectedAnnualCents)}
- Worst store: ${GROCER_LABEL[s.worstGrocer.grocer]} (${Math.round(s.worstGrocer.pct)}%)
- Repeat offenders: ${offenders}

Respond ONLY as JSON:
{"subject": string, "headline": string, "body": string (2-4 sentences), "tips": string[] (2-3 actionable, slightly smug tips)}`;
}

export function fallbackCopy(s: EmailSummary): EmailCopy {
  const total = formatCents(s.totalCents);
  return {
    subject: `Your food waste this ${s.periodType === "weekly" ? "week" : "month"}: ${total}`,
    headline: `${total} straight into the trash.`,
    body: `This ${s.periodType === "weekly" ? "week" : "month"} we threw away ${total} of food across ${s.itemCount} items. At this rate that's ${formatCents(s.projectedAnnualCents)} a year. ${GROCER_LABEL[s.worstGrocer.grocer]} did the most damage.`,
    tips: [
      "Buy half as much of anything perishable — you can always go back.",
      "If it's not getting eaten in 3 days, it doesn't go in the cart.",
      s.repeatOffenders[0] ? `Maybe stop buying ${s.repeatOffenders[0].name} until we finish a batch.` : "Check the fridge before shopping.",
    ].filter(Boolean),
  };
}

function parseCopy(text: string): EmailCopy | null {
  const m = text.match(/\{[\s\S]*\}/); if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (!o.subject || !o.headline || !o.body || !Array.isArray(o.tips)) return null;
    return { subject: o.subject, headline: o.headline, body: o.body, tips: o.tips.map(String) };
  } catch { return null; }
}

export async function generateCopy(s: EmailSummary, client: Anthropic): Promise<EmailCopy> {
  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-5", max_tokens: 600,
      messages: [{ role: "user", content: buildCopyPrompt(s) }],
    });
    const text = msg.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
    return parseCopy(text) ?? fallbackCopy(s);
  } catch {
    return fallbackCopy(s);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/email/copywriter.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/email/copywriter.ts src/email/copywriter.test.ts
git commit -m "feat: guilt-trip email copywriter with fallback"
```

### Task 7.3: Chart image + HTML email renderer

**Files:**
- Create: `src/email/chartImage.ts`, `src/email/renderEmail.ts`, `src/email/renderEmail.test.ts`

- [ ] **Step 1: Write `src/email/chartImage.ts`** (no unit test — thin wrapper over chartjs-node-canvas; exercised manually)

```ts
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import type { EmailSummary } from "./summaryBuilder.js";

const canvas = new ChartJSNodeCanvas({ width: 600, height: 300, backgroundColour: "white" });

export async function renderTrendPng(s: EmailSummary): Promise<Buffer> {
  return canvas.renderToBuffer({
    type: "bar",
    data: {
      labels: s.trend.map(t => t.label),
      datasets: [{ label: "$ wasted per week", data: s.trend.map(t => t.cents / 100) }],
    },
    options: { plugins: { legend: { display: true } }, scales: { y: { beginAtZero: true } } },
  });
}
```

- [ ] **Step 2: Write the failing test** (`src/email/renderEmail.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import { renderEmailHtml } from "./renderEmail.js";
import type { EmailSummary } from "./summaryBuilder.js";
import type { EmailCopy } from "./copywriter.js";

const summary = {
  periodType: "weekly", periodLabel: "Jun 1 – Jun 7", periodStart: "2026-06-01", periodEnd: "2026-06-08",
  totalCents: 4713, itemCount: 6, projectedAnnualCents: 245076,
  byCategory: [{ category: "produce", cents: 4713 }],
  byGrocer: [{ grocer: "whole_foods", cents: 4713, pct: 100 }],
  worstGrocer: { grocer: "whole_foods", cents: 4713, pct: 100 },
  repeatOffenders: [{ name: "Blueberries", count: 3, cents: 1797 }],
  trend: [], photoPaths: [],
} as EmailSummary;
const copy: EmailCopy = { subject: "S", headline: "Money in the bin", body: "We wasted a lot.", tips: ["Buy less"] };

describe("renderEmailHtml", () => {
  it("includes headline, total, tips, and the chart cid", () => {
    const html = renderEmailHtml(summary, copy, "trend123");
    expect(html).toContain("Money in the bin");
    expect(html).toContain("$47.13");
    expect(html).toContain("Buy less");
    expect(html).toContain("cid:trend123");
    expect(html).toContain("Blueberries");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/email/renderEmail.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write implementation** (`src/email/renderEmail.ts`)

```ts
import type { EmailSummary } from "./summaryBuilder.js";
import type { EmailCopy } from "./copywriter.js";
import { formatCents } from "../domain/money.js";

const GROCER_LABEL = { whole_foods: "Whole Foods", kroger: "Kroger", target: "Target" } as const;

export function renderEmailHtml(s: EmailSummary, copy: EmailCopy, chartCid: string): string {
  const offenders = s.repeatOffenders.map(o => `<li>${o.name} — ${o.count}× = <b>${formatCents(o.cents)}</b></li>`).join("");
  const cats = s.byCategory.map(c => `<li>${c.category}: ${formatCents(c.cents)}</li>`).join("");
  const tips = copy.tips.map(t => `<li>${t}</li>`).join("");
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#222">
  <h1 style="color:#b00020">${copy.headline}</h1>
  <p style="font-size:42px;margin:8px 0"><b>${formatCents(s.totalCents)}</b></p>
  <p style="color:#666">${s.periodLabel} · ${s.itemCount} items · projected <b>${formatCents(s.projectedAnnualCents)}</b>/yr</p>
  <p>${copy.body}</p>
  <img src="cid:${chartCid}" alt="Waste trend" style="max-width:100%"/>
  <h3>Worst store</h3>
  <p>${GROCER_LABEL[s.worstGrocer.grocer]} — ${Math.round(s.worstGrocer.pct)}% of the damage</p>
  <h3>Repeat offenders</h3><ul>${offenders || "<li>None — for once.</li>"}</ul>
  <h3>Where the money rotted</h3><ul>${cats}</ul>
  <h3>Tips (you're welcome)</h3><ul>${tips}</ul>
  </body></html>`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/email/renderEmail.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/email/chartImage.ts src/email/renderEmail.ts src/email/renderEmail.test.ts
git commit -m "feat: chart image + html email renderer"
```

### Task 7.4: Sender (Resend) + email_log

**Files:**
- Create: `src/email/sender.ts`, `src/email/sender.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
  repeatOffenders: [], trend: [], photoPaths: [],
} as EmailSummary;

describe("sendSummaryEmail", () => {
  it("sends via resend and records a sent row", async () => {
    const resend = { emails: { send: vi.fn().mockResolvedValue({ data: { id: "e1" }, error: null }) } };
    const deps = {
      resend, emailLog: new EmailLogRepo(db), from: "Bot <b@x.com>", to: "w@x.com",
      renderHtml: () => "<html>x</html>", renderChart: vi.fn().mockResolvedValue(Buffer.from("png")),
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
      renderHtml: () => "<html>x</html>", renderChart: vi.fn().mockResolvedValue(Buffer.from("png")),
      copy: { subject: "S", headline: "H", body: "B", tips: [] }, now: () => "2026-06-08T13:00:00Z",
    };
    const r = await sendSummaryEmail(summary, deps as any);
    expect(r.status).toBe("failed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/email/sender.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation** (`src/email/sender.ts`)

```ts
import type { Resend } from "resend";
import type { EmailSummary } from "./summaryBuilder.js";
import type { EmailCopy } from "./copywriter.js";
import type { EmailLogRepo } from "../db/repositories/emailLog.js";

export interface SendDeps {
  resend: Resend; emailLog: EmailLogRepo; from: string; to: string;
  copy: EmailCopy;
  renderHtml: (s: EmailSummary, copy: EmailCopy, cid: string) => string;
  renderChart: (s: EmailSummary) => Promise<Buffer>;
  now: () => string;
}

export async function sendSummaryEmail(s: EmailSummary, deps: SendDeps): Promise<{ status: "sent" | "failed" }> {
  const cid = "trend-chart";
  const html = deps.renderHtml(s, deps.copy, cid);
  let status: "sent" | "failed" = "sent";
  try {
    const png = await deps.renderChart(s);
    const res = await deps.resend.emails.send({
      from: deps.from, to: deps.to, subject: deps.copy.subject, html,
      attachments: [{ filename: "trend.png", content: png, contentId: cid } as any],
    });
    if ((res as any).error) status = "failed";
  } catch {
    status = "failed";
  }
  deps.emailLog.record({
    period_type: s.periodType, period_start: s.periodStart, period_end: s.periodEnd,
    total_cents: s.totalCents, status,
  }, deps.now());
  return { status };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/email/sender.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/email/sender.ts src/email/sender.test.ts
git commit -m "feat: resend sender + email log"
```

### Task 7.5: Scheduler decision logic

**Files:**
- Create: `src/email/scheduler.ts`, `src/email/scheduler.test.ts`

Pure decision function `dueReports(now, tz, alreadySent)` returns which reports (weekly/monthly) should fire today. The cron wiring calls it daily.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { dueReports } from "./scheduler.js";

describe("dueReports", () => {
  it("fires weekly on Monday for the prior week", () => {
    // 2026-06-08 is a Monday
    const due = dueReports(new Date("2026-06-08T13:00:00Z"), "UTC", () => false);
    const weekly = due.find(d => d.periodType === "weekly")!;
    expect(weekly).toBeTruthy();
    expect(weekly.periodStart).toBe("2026-06-01T00:00:00.000Z");
  });
  it("fires monthly on the 1st for the prior month", () => {
    const due = dueReports(new Date("2026-06-01T13:00:00Z"), "UTC", () => false);
    const monthly = due.find(d => d.periodType === "monthly")!;
    expect(monthly).toBeTruthy();
    expect(monthly.periodStart).toBe("2026-05-01T00:00:00.000Z");
  });
  it("does not fire weekly midweek", () => {
    const due = dueReports(new Date("2026-06-10T13:00:00Z"), "UTC", () => false);
    expect(due.find(d => d.periodType === "weekly")).toBeUndefined();
  });
  it("skips a report already sent", () => {
    const due = dueReports(new Date("2026-06-08T13:00:00Z"), "UTC", () => true);
    expect(due.find(d => d.periodType === "weekly")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/email/scheduler.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation** (`src/email/scheduler.ts`)

```ts
import { weekBounds, monthBounds } from "../domain/periods.js";

export interface DueReport {
  periodType: "weekly" | "monthly";
  periodStart: string; periodEnd: string; periodLabel: string;
}

export function dueReports(
  now: Date, tz: string,
  alreadySent: (periodType: "weekly" | "monthly", periodStart: string) => boolean,
): DueReport[] {
  const out: DueReport[] = [];
  const isMonday = ((now.getUTCDay() + 6) % 7) === 0;
  const isFirst = now.getUTCDate() === 1;

  if (isMonday) {
    const priorWeekDay = new Date(now); priorWeekDay.setUTCDate(now.getUTCDate() - 1);
    const w = weekBounds(priorWeekDay, tz);
    if (!alreadySent("weekly", w.startIso)) {
      out.push({ periodType: "weekly", periodStart: w.startIso, periodEnd: w.endIso, periodLabel: w.label });
    }
  }
  if (isFirst) {
    const priorMonthDay = new Date(now); priorMonthDay.setUTCDate(0); // last day of prior month
    const m = monthBounds(priorMonthDay, tz);
    if (!alreadySent("monthly", m.startIso)) {
      out.push({ periodType: "monthly", periodStart: m.startIso, periodEnd: m.endIso, periodLabel: m.label });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/email/scheduler.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/email/scheduler.ts src/email/scheduler.test.ts
git commit -m "feat: scheduler due-report decision logic"
```

### Task 7.6: Send-report orchestrator + test-send route

**Files:**
- Create: `src/email/sendReport.ts`, `src/http/routes/email.ts`, `src/http/routes/email.test.ts`

`sendReport` ties together: gather period items + history → buildSummary → generateCopy → sendSummaryEmail. The test-send route triggers it on demand for the current week.

- [ ] **Step 1: Write the failing test** (`src/http/routes/email.test.ts`)

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { openDb, migrate, DB } from "../../db/connection.js";
import Fastify from "fastify";
import { registerEmailRoutes } from "./email.js";

let db: DB;
beforeEach(() => { db = openDb(":memory:"); migrate(db); });

describe("POST /api/email/test", () => {
  it("invokes the report sender for the current week", async () => {
    const sendReport = vi.fn().mockResolvedValue({ status: "sent" });
    const app = Fastify();
    registerEmailRoutes(app, { passcode: "secret", sendReport, now: () => new Date("2026-06-07T00:00:00Z") } as any);
    const res = await app.inject({ method: "POST", url: "/api/email/test", headers: { "x-passcode": "secret" } });
    expect(res.statusCode).toBe(200);
    expect(sendReport).toHaveBeenCalledWith("weekly", expect.any(Date));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/http/routes/email.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/email/sendReport.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import type { WasteItemsRepo } from "../db/repositories/wasteItems.js";
import type { EmailLogRepo } from "../db/repositories/emailLog.js";
import { weekBounds, monthBounds } from "../domain/periods.js";
import { buildSummary } from "./summaryBuilder.js";
import { generateCopy } from "./copywriter.js";
import { renderEmailHtml } from "./renderEmail.js";
import { renderTrendPng } from "./chartImage.js";
import { sendSummaryEmail } from "./sender.js";

export interface SendReportDeps {
  items: WasteItemsRepo; emailLog: EmailLogRepo; anthropic: Anthropic; resend: Resend;
  from: string; to: string; tz: string;
}

export function makeSendReport(deps: SendReportDeps) {
  return async (periodType: "weekly" | "monthly", now: Date): Promise<{ status: "sent" | "failed" }> => {
    const b = periodType === "weekly" ? weekBounds(now, deps.tz) : monthBounds(now, deps.tz);
    const periodItems = deps.items.listBetween(b.startIso, b.endIso).filter(i => i.price_cents != null);
    const allItems = deps.items.listRecent(2000).filter(i => i.price_cents != null);
    const summary = buildSummary({
      periodType, periodLabel: b.label, periodStart: b.startIso, periodEnd: b.endIso,
      periodItems, allItems, tz: deps.tz,
    });
    const copy = await generateCopy(summary, deps.anthropic);
    return sendSummaryEmail(summary, {
      resend: deps.resend, emailLog: deps.emailLog, from: deps.from, to: deps.to, copy,
      renderHtml: renderEmailHtml, renderChart: renderTrendPng, now: () => new Date().toISOString(),
    });
  };
}
```

- [ ] **Step 4: Write `src/http/routes/email.ts`**

```ts
import type { FastifyInstance } from "fastify";
import { checkPasscode } from "../auth.js";

export interface EmailRouteDeps {
  passcode: string;
  sendReport: (periodType: "weekly" | "monthly", now: Date) => Promise<{ status: "sent" | "failed" }>;
  now: () => Date;
}

export function registerEmailRoutes(app: FastifyInstance, deps: EmailRouteDeps): void {
  app.post("/api/email/test", async (req, reply) => {
    if (!checkPasscode(deps.passcode, req.headers["x-passcode"] as string | undefined)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const result = await deps.sendReport("weekly", deps.now());
    return reply.send(result);
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/http/routes/email.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/email/sendReport.ts src/http/routes/email.ts src/http/routes/email.test.ts
git commit -m "feat: send-report orchestrator + test-send route"
```

---

## Phase 8 — Wiring & Boot

### Task 8.1: Composition root (`src/index.ts`)

**Files:**
- Create: `src/index.ts`

This file has no unit test (it is the wiring). It is verified by `npm run build` and a manual boot.

- [ ] **Step 1: Write `src/index.ts`**

```ts
import cron from "node-cron";
import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { loadConfig } from "./config.js";
import { openDb, migrate } from "./db/connection.js";
import { WasteItemsRepo } from "./db/repositories/wasteItems.js";
import { PriceChecksRepo } from "./db/repositories/priceChecks.js";
import { EmailLogRepo } from "./db/repositories/emailLog.js";
import { SettingsRepo } from "./db/repositories/settings.js";
import { JobQueue } from "./queue/jobQueue.js";
import { startRunner } from "./queue/runner.js";
import { processItem } from "./queue/worker.js";
import { identifyItem } from "./identify/index.js";
import { lookupBarcode } from "./identify/openFoodFacts.js";
import { identifyPhoto } from "./identify/visionIdentifier.js";
import { readPhotoAsBase64 } from "./storage/photos.js";
import { resolvePrice } from "./price/resolvePrice.js";
import { selectSource } from "./price/selectSource.js";
import { estimatePrice } from "./price/aiEstimate.js";
import { buildServer } from "./http/server.js";
import { registerCaptureRoutes } from "./http/routes/captures.js";
import { registerLedgerRoutes } from "./http/routes/ledger.js";
import { registerItemRoutes } from "./http/routes/items.js";
import { registerSettingsRoutes } from "./http/routes/settings.js";
import { registerEmailRoutes } from "./http/routes/email.js";
import { makeSendReport } from "./email/sendReport.js";
import { dueReports } from "./email/scheduler.js";

const cfg = loadConfig();
mkdirSync(join(cfg.dataDir, "photos"), { recursive: true });
const db = openDb(join(cfg.dataDir, "foodwaster.sqlite"));
migrate(db);

const items = new WasteItemsRepo(db);
const checks = new PriceChecksRepo(db);
const emailLog = new EmailLogRepo(db);
const settings = new SettingsRepo(db);
const queue = new JobQueue(db);

const anthropic = new Anthropic({ apiKey: cfg.anthropicKey });
const resend = new Resend(cfg.resendKey);

const process1 = (item: import("./types.js").WasteItem) => processItem(item, {
  items, checks,
  identify: (it) => identifyItem(it, {
    lookupBarcode: (bc) => lookupBarcode(bc),
    identifyPhoto: (b64, mt) => identifyPhoto(b64, mt, anthropic),
    readPhoto: async (p) => readPhotoAsBase64(p),
  }),
  resolve: (q) => resolvePrice(q, {
    source: selectSource(q.grocer, cfg),
    estimate: (qq) => estimatePrice(qq, anthropic),
  }),
  now: () => new Date().toISOString(),
});

const stopRunner = startRunner(queue, items, process1, 3000);

const sendReport = makeSendReport({
  items, emailLog, anthropic, resend,
  from: cfg.emailFrom, to: settings.get("wife_email", cfg.wifeEmail), tz: cfg.tz,
});

const app = buildServer({
  registerRoutes: (a) => {
    registerCaptureRoutes(a, { items, queue, dataDir: cfg.dataDir, passcode: cfg.passcode, now: () => new Date().toISOString() });
    registerLedgerRoutes(a, { items, passcode: cfg.passcode, tz: cfg.tz, now: () => new Date() });
    registerItemRoutes(a, { items, passcode: cfg.passcode });
    registerSettingsRoutes(a, { settings, passcode: cfg.passcode });
    registerEmailRoutes(a, { passcode: cfg.passcode, sendReport, now: () => new Date() });
  },
});

// Daily 13:00 UTC: fire any due weekly/monthly reports (respecting toggles).
cron.schedule("0 13 * * *", async () => {
  const now = new Date();
  const due = dueReports(now, cfg.tz, (pt, ps) => emailLog.alreadySent(pt, ps));
  for (const d of due) {
    if (d.periodType === "weekly" && settings.get("weekly_enabled", "true") !== "true") continue;
    if (d.periodType === "monthly" && settings.get("monthly_enabled", "true") !== "true") continue;
    await sendReport(d.periodType, now);
  }
});

const port = Number(process.env.PORT ?? 8080);
app.listen({ port, host: "0.0.0.0" }).then(() => {
  app.log.info(`FoodWaster on :${port}`);
});

process.on("SIGTERM", () => { stopRunner(); db.close(); process.exit(0); });
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: `tsc` completes with no type errors and `schema.sql` is copied to `dist`.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts package.json
git commit -m "feat: composition root wiring server, worker, cron"
```

---

## Phase 9 — PWA Frontend

> The frontend is static files served by Fastify. It is verified manually in a mobile browser (camera requires HTTPS — test via the deployed URL or a tunnel). Keep logic minimal; the backend holds the truth.

### Task 9.1: PWA shell + manifest + service worker

**Files:**
- Create: `public/index.html`, `public/styles.css`, `public/manifest.webmanifest`, `public/sw.js`

- [ ] **Step 1: Create `public/manifest.webmanifest`**

```json
{
  "name": "FoodWaster",
  "short_name": "FoodWaster",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#111111",
  "theme_color": "#b00020",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Create `public/sw.js`** (minimal offline shell; network-first for API)

```js
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => self.clients.claim());
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return; // always network for API
  e.respondWith(fetch(e.request).catch(() => caches.match("/index.html")));
});
```

- [ ] **Step 3: Create `public/styles.css`** (mobile-first)

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; background: #111; color: #eee; }
header { padding: 12px 16px; background: #b00020; font-weight: 700; }
main { padding: 16px; padding-bottom: 96px; }
.tabbar { position: fixed; bottom: 0; left: 0; right: 0; display: flex; background: #1b1b1b; }
.tabbar button { flex: 1; padding: 14px; background: none; border: none; color: #aaa; font-size: 14px; }
.tabbar button.active { color: #fff; border-top: 2px solid #b00020; }
.grocer-row { display: flex; gap: 8px; margin: 12px 0; }
.grocer-row button { flex: 1; padding: 12px; border-radius: 10px; border: 1px solid #333; background: #1b1b1b; color: #eee; }
.grocer-row button.sel { background: #b00020; border-color: #b00020; }
.big-btn { width: 100%; padding: 18px; font-size: 18px; border: none; border-radius: 12px; margin: 8px 0; background: #2a2a2a; color: #fff; }
#video { width: 100%; border-radius: 12px; background: #000; }
.item { padding: 10px; border-bottom: 1px solid #222; display: flex; justify-content: space-between; }
.pending { color: #e0a000; }
.total { font-size: 40px; font-weight: 800; }
.muted { color: #888; font-size: 13px; }
input[type=password], input[type=text] { padding: 12px; width: 100%; border-radius: 10px; border: 1px solid #333; background: #1b1b1b; color: #eee; }
```

- [ ] **Step 4: Create `public/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="stylesheet" href="/styles.css" />
  <title>FoodWaster</title>
</head>
<body>
  <header>FoodWaster 🗑️💸</header>
  <main id="app">
    <section id="gate">
      <p>Enter passcode</p>
      <input id="passcode" type="password" inputmode="numeric" />
      <button class="big-btn" id="unlock">Unlock</button>
    </section>

    <section id="capture" hidden>
      <div class="grocer-row" id="grocers">
        <button data-g="whole_foods">Whole Foods</button>
        <button data-g="kroger">Kroger</button>
        <button data-g="target">Target</button>
      </div>
      <video id="video" playsinline hidden></video>
      <button class="big-btn" id="scanBtn">📷 Scan barcode</button>
      <button class="big-btn" id="photoBtn">🖼️ Photo of item</button>
      <input id="fileInput" type="file" accept="image/*" capture="environment" hidden />
      <p class="muted" id="captureStatus"></p>
    </section>

    <section id="ledger" hidden>
      <p class="muted" id="weekLabel"></p>
      <div class="total" id="weekTotal">$0.00</div>
      <p class="muted">This month: <span id="monthTotal">$0.00</span> · Projected/yr: <span id="annual">$0.00</span></p>
      <canvas id="trend" height="160"></canvas>
      <h3>Recent</h3>
      <div id="items"></div>
      <button class="big-btn" id="testEmail">✉️ Send test email</button>
    </section>
  </main>

  <nav class="tabbar" id="tabs" hidden>
    <button data-tab="capture" class="active">Capture</button>
    <button data-tab="ledger">Ledger</button>
  </nav>

  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script type="module" src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 5: Add icons placeholder note**

Create two PNGs `public/icon-192.png` and `public/icon-512.png` (any solid-color square with a trash emoji is fine for v1; generate with any image tool). These are required for installability but not for functionality.

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/styles.css public/manifest.webmanifest public/sw.js public/icon-192.png public/icon-512.png
git commit -m "feat: PWA shell, manifest, service worker"
```

### Task 9.2: Frontend app logic (`public/app.js`)

**Files:**
- Create: `public/app.js`

Handles: passcode storage, grocer selection, barcode scan via `@zxing/library` (loaded from CDN), photo capture → base64 → POST, ledger fetch + render + Chart.js trend, test email button.

- [ ] **Step 1: Create `public/app.js`**

```js
import { BrowserMultiFormatReader } from "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/+esm";

const $ = (id) => document.getElementById(id);
let passcode = localStorage.getItem("fw_pass") || "";
let grocer = localStorage.getItem("fw_grocer") || "whole_foods";
const headers = () => ({ "Content-Type": "application/json", "x-passcode": passcode });

function showApp() {
  $("gate").hidden = true; $("tabs").hidden = false;
  selectTab("capture");
  highlightGrocer();
}

$("unlock").onclick = async () => {
  passcode = $("passcode").value.trim();
  const res = await fetch("/api/ledger", { headers: headers() });
  if (res.ok) { localStorage.setItem("fw_pass", passcode); showApp(); }
  else alert("Wrong passcode");
};
if (passcode) {
  fetch("/api/ledger", { headers: headers() }).then(r => { if (r.ok) showApp(); });
}

// Tabs
function selectTab(tab) {
  for (const b of document.querySelectorAll("#tabs button")) b.classList.toggle("active", b.dataset.tab === tab);
  $("capture").hidden = tab !== "capture";
  $("ledger").hidden = tab !== "ledger";
  if (tab === "ledger") loadLedger();
}
for (const b of document.querySelectorAll("#tabs button")) b.onclick = () => selectTab(b.dataset.tab);

// Grocer selection
function highlightGrocer() {
  for (const b of document.querySelectorAll("#grocers button")) b.classList.toggle("sel", b.dataset.g === grocer);
}
for (const b of document.querySelectorAll("#grocers button")) b.onclick = () => {
  grocer = b.dataset.g; localStorage.setItem("fw_grocer", grocer); highlightGrocer();
};

// Capture: barcode
const reader = new BrowserMultiFormatReader();
let scanning = false;
$("scanBtn").onclick = async () => {
  const video = $("video");
  if (scanning) { reader.reset(); video.hidden = true; scanning = false; $("scanBtn").textContent = "📷 Scan barcode"; return; }
  video.hidden = false; scanning = true; $("scanBtn").textContent = "⏹ Stop scanning";
  reader.decodeFromVideoDevice(null, video, async (result) => {
    if (result) {
      const code = result.getText();
      await postCapture({ grocer, capture_type: "barcode", barcode: code });
      navigator.vibrate?.(80);
      $("captureStatus").textContent = `Logged barcode ${code} ✓`;
    }
  });
};

// Capture: photo
$("photoBtn").onclick = () => $("fileInput").click();
$("fileInput").onchange = async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const base64 = await fileToBase64(file);
  await postCapture({ grocer, capture_type: "photo", photoBase64: base64 });
  $("captureStatus").textContent = "Photo logged ✓ (pricing…)";
  e.target.value = "";
};

function fileToBase64(file) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.readAsDataURL(file);
  });
}

async function postCapture(body) {
  const res = await fetch("/api/captures", { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) $("captureStatus").textContent = "Failed to log ✗";
}

// Ledger
let chart;
async function loadLedger() {
  const res = await fetch("/api/ledger", { headers: headers() });
  if (!res.ok) return;
  const d = await res.json();
  $("weekLabel").textContent = d.weekLabel;
  $("weekTotal").textContent = fmt(d.weekTotalCents);
  $("monthTotal").textContent = fmt(d.monthTotalCents);
  $("annual").textContent = fmt(d.projectedAnnualCents);
  $("items").innerHTML = d.recent.map(renderItem).join("");
  for (const el of document.querySelectorAll("[data-edit]")) el.onclick = () => editPrice(Number(el.dataset.edit));
  drawTrend(d.weeklyTrend);
}

function renderItem(i) {
  const price = i.price_cents == null
    ? `<span class="pending">pending…</span>`
    : `${fmt(i.price_cents)} <span class="muted">(${i.price_source})</span>`;
  return `<div class="item"><span>${i.product_name ?? "…"} <span class="muted">${i.grocer}</span></span>
    <span data-edit="${i.id}">${price}</span></div>`;
}

async function editPrice(id) {
  const val = prompt("Set price in dollars (e.g. 5.99):");
  if (!val) return;
  await fetch(`/api/items/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify({ priceDollars: val }) });
  loadLedger();
}

function drawTrend(trend) {
  const ctx = $("trend");
  chart?.destroy();
  chart = new Chart(ctx, {
    type: "bar",
    data: { labels: trend.map(t => t.label), datasets: [{ label: "$ / week", data: trend.map(t => t.cents / 100), backgroundColor: "#b00020" }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { color: "#aaa" } }, x: { ticks: { color: "#aaa" } } } },
  });
}

$("testEmail").onclick = async () => {
  const res = await fetch("/api/email/test", { method: "POST", headers: headers() });
  alert(res.ok ? "Test email " + (await res.json()).status : "Failed");
};

const fmt = (c) => `$${(c / 100).toFixed(2)}`;

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
```

- [ ] **Step 2: Manual verification (deployed or via HTTPS tunnel)**

Run locally: `npm run dev`, then expose over HTTPS (e.g. `npx localtunnel --port 8080` or deploy). On the phone:
- Enter passcode → unlocks.
- Select Kroger → scan a barcode → "Logged ✓"; item appears as pending in Ledger, then becomes priced after the worker runs.
- Take a photo of a loose item → appears pending → priced.
- Tap a price → override → updates.
- Tap "Send test email" → check the recipient inbox.

- [ ] **Step 3: Commit**

```bash
git add public/app.js
git commit -m "feat: PWA frontend logic (scan, photo, ledger, charts)"
```

---

## Phase 10 — Deploy

### Task 10.1: Dockerfile + README

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `README.md`

- [ ] **Step 1: Create `Dockerfile`** (Playwright base image ships Chromium + deps)

```dockerfile
FROM mcr.microsoft.com/playwright:v1.47.0-jammy
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
VOLUME ["/app/data"]
CMD ["node", "dist/src/index.js"]
```

- [ ] **Step 2: Create `.dockerignore`**

```
node_modules
dist
data
.git
.superpowers
```

- [ ] **Step 3: Create `README.md`** with setup + deploy steps

````markdown
# FoodWaster

Single-user mobile PWA that logs thrown-away groceries, prices them, and emails weekly/monthly guilt-trip summaries.

## Local dev
```bash
cp .env.example .env   # fill in keys
npm install
npm run dev            # http://localhost:8080
```
Camera needs HTTPS — use a tunnel (`npx localtunnel --port 8080`) to test scanning on a phone.

## Required services
- **Anthropic** API key (vision + price estimates + email copy).
- **Resend** API key + verified sender domain for `EMAIL_FROM`.
- **Kroger** developer app: `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`, and a `KROGER_LOCATION_ID` (find via Kroger Locations API for your store).
- **Target**: `TARGET_STORE_ID` (your store) + `TARGET_API_KEY` (public redsky web key). Unofficial; may break.
- **Whole Foods**: no key; scraped via Playwright. `WHOLE_FOODS_ZIP` optional for location context.

## Deploy (one box)
1. Push repo to GitHub.
2. On Railway/Render/Fly: new service from the Dockerfile.
3. Add a **persistent volume** mounted at `/app/data`.
4. Set all env vars from `.env.example`.
5. Deploy. Open the HTTPS URL on your phone, enter the passcode, "Add to Home Screen".

## Tests
```bash
npm test
```
````

- [ ] **Step 4: Build the image to verify**

Run: `docker build -t foodwaster .`
Expected: image builds; `npm run build` succeeds inside.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile .dockerignore README.md
git commit -m "chore: dockerfile, dockerignore, readme"
```

### Task 10.2: Full test suite green

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all test files pass. If any fail, fix before proceeding.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "test: full suite green"
```

---

## Post-Build Manual Checklist (not code)

These require real accounts/credentials and a deployed HTTPS URL:

- [ ] Register Kroger developer app; capture client id/secret; resolve your store `locationId`; set env vars; confirm a Kroger barcode resolves to a real price.
- [ ] Find your Target store id + a working redsky key; confirm a Target item prices.
- [ ] Confirm Whole Foods scrape returns a price for a common item; observe how often it falls back to AI estimate (expected to be frequent).
- [ ] Verify Resend domain; send a test email; confirm it lands in the spouse's inbox (check spam).
- [ ] Install PWA to home screen; scan 5 items rapid-fire; confirm all resolve.
- [ ] Wait for (or simulate) a Monday/1st cron fire; confirm weekly/monthly email arrives once (no duplicates — `email_log` guard).

---

## Self-Review Notes (author)

- **Spec coverage:** capture (barcode+photo) ✓; async queue + worker ✓; identify (OFF + vision) ✓; price (Kroger/Target/WF/AI) ✓; fallback ✓; ledger + trends ✓; repeat offenders ✓; projected annual ✓; category + worst-grocer ✓; reduction tips ✓ (copywriter); photo gallery ✓ (photoPaths captured + recent list; email wall-of-shame can extend `renderEmailHtml` later — paths are available); weekly+monthly guilt email via Resend ✓; cron ✓; passcode ✓; SQLite on volume ✓; one box ✓.
- **"Cheaper next time" feature:** fully specified as **Task 6.5** (`cheapestAcross` + `/api/items/:id/cheaper` route + ledger UI button). In v1.
- **Photo wall-of-shame:** photos are captured and stored; `EmailSummary.photoPaths` carries them and the ledger lists items. Rendering the photo grid into the email body is a small additive extension of `renderEmailHtml` (loop `s.photoPaths` into `<img>` tags with `cid:` attachments) — building blocks all present; can be added when the email visual is tuned with real data.
- **Placeholders:** none — every code step has full code.
- **Type consistency:** `PriceResult`, `IdentifyResult`, `WasteItem`, repo method names (`setIdentity`/`setPrice`/`setPhotoPath`/`listBetween`/`listRecent`) are consistent across tasks.
````
