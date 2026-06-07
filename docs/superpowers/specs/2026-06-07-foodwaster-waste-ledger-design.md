# FoodWaster — Food Waste Cost Ledger

**Date:** 2026-06-07
**Status:** Approved design, pre-implementation
**Owner:** Chris

## Problem

Spouse buys groceries (often pricey — Whole Foods) that go unused and rot, and
get thrown away. The waste is invisible because it's never tallied in dollars.
Goal: make the waste *concrete and undeniable in dollars* by logging tossed
items and emailing a recurring, pointed summary.

## Goals

- Log a wasted food item in seconds, from a phone, at the moment of tossing it.
- Attach a believable dollar price to each item (real price preferred, AI
  estimate as fallback).
- Maintain a running ledger and trends.
- Email the spouse weekly and monthly summaries in a guilt-trip / mildly
  critical tone, from a bot address.

## Non-Goals

- Not an inventory / pantry tracker. Items are logged **at disposal only**
  (waste-only model). No purchase logging, no expiry prediction, no
  "use-it-soon" recipes (the item is already trash).
- No multi-user accounts. Single operator (Chris) on one phone. The spouse only
  ever receives email; she does not log in.
- Not a general "any grocer" tool. Exactly three grocers: Whole Foods, Kroger,
  Target.

## Users / Access

- **Single user.** No real auth; a single shared passcode gates the app.
- Spouse is email-recipient only.

## Core Flow

1. On phone (installed PWA), pick grocer (sticky — remembers last used).
2. Either **scan a barcode** (live camera) or **snap a photo** of a loose
   (non-barcode) item.
3. Capture POSTs immediately and returns; the item appears in the ledger as
   **pending price**. User can rapid-fire many captures without waiting.
4. A background worker resolves each item's identity and price asynchronously.
5. Ledger/dashboard shows running totals, trends, and lets the user review or
   override any price.
6. Cron builds and sends weekly + monthly guilt emails to the spouse.

## Architecture

One always-on box (Railway / Render / Fly.io) runs the entire system:

- **Web + API** — serves the PWA, accepts captures, serves ledger/dashboard
  data, test-send endpoint.
- **Job queue + worker** — resolves pending items (identify → price → persist).
- **Cron** — node-cron, runs daily, fires weekly (Sunday) and monthly (1st)
  emails.
- **SQLite** (better-sqlite3) on a **persistent volume**. Photos stored on the
  same volume.

HTTPS is required (camera access). Single deployed service.

### External services

- **Identify:** Open Food Facts (barcode → product name/brand/category, free);
  Claude vision (photo → product identity).
- **Price:** Kroger API (official, free, reliable); Target redsky API
  (unofficial, may break); Whole Foods via Playwright headless scrape (flaky —
  see Risks); Claude price estimate as universal fallback.
- **Email:** Resend (existing account), bot from-address on a verified domain.
- **AI:** Anthropic Claude — vision identify, price-estimate fallback, email
  copy, reduction tips.

## Data Model (SQLite)

**waste_item**
- `id`
- `captured_at`
- `grocer` (whole_foods | kroger | target)
- `capture_type` (barcode | photo)
- `barcode` (nullable)
- `photo_path` (nullable)
- `product_name`, `brand`, `category` (filled by identify step)
- `status` (pending | priced | failed | manual)
- `price_cents` (nullable until priced)
- `price_source` (scrape | api | ai_estimate | manual)
- `confidence` (0–1, from identify/match step)
- `qty` (default 1)
- `notes` (nullable)

**price_check** (audit trail per attempt)
- `id`, `item_id`, `source`, `raw_result`, `success`, `ran_at`

**email_log**
- `id`, `period_type` (weekly | monthly), `period_start`, `period_end`,
  `total_cents`, `sent_at`, `status`

**settings**
- `passcode`, `wife_email`, per-grocer store/location IDs, cadence toggles
  (weekly_enabled, monthly_enabled)

## Price-Resolution Pipeline

Worker pulls each `pending` item:

1. **Identify**
   - Barcode → Open Food Facts lookup → name / brand / category.
   - Photo → Claude vision → name / brand / category.
2. **Price** (by grocer)
   - Kroger → official API (requires registered app: client id/secret, OAuth;
     pricing requires a store `locationId`).
   - Target → unofficial redsky aggregations API (requires store id + product
     tcin; treat as best-effort, may break).
   - Whole Foods → Playwright headless scrape (location/Prime-gated, strong
     anti-bot; expect frequent failures).
   - Matching an identified product to the grocer's exact catalog entry is
     fuzzy: search by name/UPC, take best match, record `confidence`.
3. **Fallback** — on failure or low confidence, Claude estimates the price;
   tagged `ai_estimate`.
4. Item set to `priced` with `price_source` + `confidence`. UI badges the
   source so real prices are trusted and estimates can be overridden.

Retries with backoff before falling back to AI. Each attempt logged to
`price_check`. Items are never silently dropped — a fully failed resolution
still lands as an AI estimate (or `failed` for manual entry if even that is
unavailable).

## Features (all in v1)

Core: rapid capture, async price resolution, ledger, weekly + monthly guilt
email. Plus:

1. **Waste $ trend chart** — per week & month over time; in app and embedded
   (rendered to image) in email.
2. **Repeat-offender items** — e.g. "Organic blueberries: tossed 4× = $23.96."
3. **Projected annual waste** — "At this rate: $2,410/yr in the trash."
4. **Cheaper next time** — for a wasted item, where it costs less (other
   grocer / generic equivalent); uses price-compare across the three sources.
5. **AI reduction tips** — Claude writes 2–3 tailored tips per email.
6. **Category breakdown** — produce / dairy / meat / etc.; chart of where money
   rots.
7. **Worst grocer stat** — e.g. "Whole Foods = 78% of your waste."
8. **Waste photo gallery** — keep snapped pics; "wall of shame" grid in app and
   optionally email.

## Email

- node-cron runs daily; sends weekly on Sunday, monthly on the 1st (each
  gated by its cadence toggle).
- Summary content: total $, item count, trend chart image, repeat offenders,
  projected annual, category + worst-grocer breakdown, 2–3 Claude tips,
  optional wall-of-shame photos.
- Tone: guilt-trip, mildly critical/condescending. Copy written by Claude.
- Sent via Resend from a bot address. Logged to `email_log`.
- In-app **test-send** button to preview before the spouse receives it.

## Tech Stack

- TypeScript, single repo.
- API: Fastify (or Express) + static PWA frontend.
- Queue: in-process job queue (e.g. BullMQ if Redis available, else a simple
  SQLite-backed queue — single user, low volume).
- Barcode scanning: `@zxing` wasm in-browser (works on iOS Safari, where the
  native BarcodeDetector API is unavailable).
- Scraping: Playwright (Whole Foods).
- DB: better-sqlite3 on a persistent volume.
- Scheduling: node-cron.
- Email: Resend SDK.
- AI: Anthropic SDK (Claude).

### Secrets / config

Anthropic API key, Resend API key, Kroger client id/secret, per-grocer store
IDs, app passcode, wife email.

## Error Handling

- Failed price → retries with backoff → AI estimate → `failed` (manual) only as
  last resort. Never silently lost.
- Per-grocer price sources isolated: one breaking does not affect the others.
- `price_check` retains raw results for debugging flaky scrapers.

## Testing

- Unit: total/period math, projected-annual calc, repeat-offender aggregation,
  guilt-copy/email builder.
- Contract tests per price source (mocked responses) — detect when a source's
  shape changes.
- E2E happy path: capture → pending → priced.

## Risks / Honest Caveats

- **Whole Foods scraping is the weakest link.** Amazon-owned, location/Prime
  gated, aggressive anti-bot, datacenter IPs flagged. AI estimates will carry a
  meaningful share of WF prices. Acceptable per design.
- **Target redsky is unofficial** and can break without notice.
- **Product → catalog matching is fuzzy**; confidence badges + manual override
  mitigate.
- Believability matters (the spouse must trust the numbers): source +
  confidence are always visible and overridable.

## Open Questions (to confirm before/at build)

- Resend verified domain for the bot from-address (or start on Resend's
  onboarding domain).
- Kroger developer app registration (client id/secret) + chosen store
  locationId.
- Target + Whole Foods store/location identification (zip-based).
