# Admin Item Management + Scan Animation

**Date:** 2026-06-08
**Status:** Approved design, pre-implementation
**Project:** FoodWaster (live PWA — Node/TypeScript + Fastify + node:sqlite, deployed on Fly)

## Problem

Two operational gaps and one polish item on the live app:

1. AI/scrape results are sometimes wrong (mis-identified product, off price). The admin (sole user) needs to **delete** an inaccurate ledger item.
2. The admin needs to **edit** an item's **name and price** when the result is close but wrong, rather than deleting and re-scanning.
3. The barcode scanner gives no visual feedback while the camera is open. A **scanning animation** (a red line sweeping up/down the preview) should signal "attempting to scan."

## Goals

- Delete any ledger item (hard delete) from the phone UI.
- Edit any item's product name and price from the phone UI.
- Show a sweeping-line scan animation while the camera is open.

## Non-Goals

- No soft delete / trash / undo (hard delete is intentional).
- No bulk operations.
- No editing of grocer, category, quantity, or photo in this round (the PATCH API already supports category/qty if needed later; the UI exposes only name + price).
- No new auth model — the existing single passcode gates everything.

## Existing Code Being Reused

- `PATCH /api/items/:id` (`src/http/routes/items.ts`) already accepts `product_name`, `priceDollars`, `category`, `qty`. Editing price sets `price_source="manual"`, `status="manual"` (so the worker won't overwrite it); editing name calls `setIdentity` and keeps the price. **No backend change is required for edit.**
- `WasteItemsRepo` (`src/db/repositories/wasteItems.ts`) — add a `delete` method.
- Ledger UI lives in `public/app.js` (`renderItem`, `loadLedger`), styles in `public/styles.css`, markup in `public/index.html`.

## Design

### 1. Backend — delete

**Repository** (`src/db/repositories/wasteItems.ts`): add

```ts
delete(id: number): boolean
```

It removes dependent rows before the item to satisfy the foreign keys
(`price_check.item_id` and `job.item_id` both reference `waste_item(id)`), in a
single manual transaction (node:sqlite has no `.transaction()` helper):

```
BEGIN
DELETE FROM price_check WHERE item_id = ?
DELETE FROM job        WHERE item_id = ?
DELETE FROM waste_item WHERE id = ?
COMMIT  (ROLLBACK on error)
```

Returns `true` if the `waste_item` row existed (based on the delete's `changes`), else `false`.

**Route** (`src/http/routes/items.ts`): add to `registerItemRoutes`

```
DELETE /api/items/:id
- passcode check (x-passcode) → 401 if missing/wrong
- items.delete(id) → false → 404 { error: "not found" }
- true → 200 { ok: true }
```

### 2. Backend — edit

No change. The existing `PATCH /api/items/:id` covers name + price. The frontend
will send `{ product_name, priceDollars }`.

### 3. Frontend — inline editor

In `public/app.js`:

- `renderItem(i)` renders the row as today, plus a hidden inline editor block
  keyed to the item id. The row is tappable to toggle its editor open/closed.
- Only one editor open at a time (opening one closes others).
- The editor contains:
  - **Name** text input, prefilled with `i.product_name`.
  - **Price** input (`inputmode="decimal"`), prefilled with the dollar value of
    `i.price_cents` (blank if null).
  - **Save** button → `PATCH /api/items/:id` with
    `{ product_name: <name>, priceDollars: <price> }` (omit price if left blank
    so an unpriced item isn't forced to 0) → on success, `loadLedger()`.
  - **Delete** button → `confirm("Delete this item?")` → `DELETE /api/items/:id`
    → on success, `loadLedger()`.
- This replaces the current price-only `prompt()` (`editPrice` and the
  `data-edit` tap handler are removed/superseded).

Styles in `public/styles.css`: a compact editor panel (stacked inputs + a
button row) consistent with the existing dark mobile theme; Delete button
styled distinctly (e.g. outlined red).

### 4. Frontend — scan animation (Style A)

In `public/index.html`: wrap the existing `<video id="video">` in a positioned
container with an overlay element:

```html
<div id="scanwrap" class="scanwrap" hidden>
  <video id="video" playsinline></video>
  <div class="scanline"></div>
</div>
```

In `public/styles.css`:

```css
.scanwrap { position: relative; }
.scanline {
  position: absolute; left: 6%; right: 6%; height: 2px;
  background: #ff2d2d; box-shadow: 0 0 10px 2px rgba(255,45,45,.9);
  border-radius: 2px; animation: scansweep 2.4s ease-in-out infinite;
}
@keyframes scansweep { 0% { top: 8%; } 50% { top: 88%; } 100% { top: 8%; } }
```

In `public/app.js`: show `#scanwrap` (instead of toggling `#video.hidden`) when
scanning starts; hide it when scanning stops — both on a successful first read
(the existing auto-close path) and on manual stop. The overlay is purely
decorative; it does not touch the zxing decode pipeline.

## Data Flow

- **Delete:** tap row → Delete → confirm → `DELETE /api/items/:id` → repo removes
  price_check + job + item in a transaction → ledger refetch shows it gone, totals
  recomputed (priced-items aggregation already filters live).
- **Edit:** tap row → edit fields → Save → `PATCH` → repo `setIdentity` and/or
  `setPrice(manual)` → ledger refetch shows updated values.
- **Scan animation:** start scan → `#scanwrap` shown → CSS line sweeps → first
  decode (or manual stop) → `#scanwrap` hidden.

## Error Handling

- All new/used endpoints enforce the passcode and return 401 otherwise.
- `DELETE` on a missing id → 404.
- `PATCH` with a malformed body → 400 (existing zod validation).
- Frontend: failed `DELETE`/`PATCH` (`res.ok` false) surfaces a brief message
  (e.g. `alert` / status text) and leaves the row as-is.
- Delete is irreversible, so it is gated behind a `confirm()` dialog.

## Testing

- **Repo** (`wasteItems.test.ts`): `delete` removes the item and its
  `price_check` + `job` rows; returns `true` when present and `false` when absent.
- **Route** (`items.test.ts`): `DELETE /api/items/:id` returns 401 without
  passcode, 404 for a missing id, 200 `{ok:true}` on success, and the item is
  gone afterward.
- **Edit** is already covered by the existing `items.test.ts` PATCH test.
- **Frontend** (inline editor + scan animation): verified manually on the phone
  against the live deploy (camera needs HTTPS).

## Files Touched

- `src/db/repositories/wasteItems.ts` — add `delete`.
- `src/http/routes/items.ts` — add `DELETE` route.
- `src/db/repositories/wasteItems.test.ts` — delete tests.
- `src/http/routes/items.test.ts` — DELETE route tests.
- `public/index.html` — `#scanwrap` wrapper + overlay.
- `public/app.js` — inline editor, delete, scan-overlay toggle.
- `public/styles.css` — editor panel + `.scanline` animation.

## Deployment

Standard: merge to `main` → the existing GitHub Action auto-deploys to Fly. No
new env vars, no schema migration (only row deletes use existing tables).
