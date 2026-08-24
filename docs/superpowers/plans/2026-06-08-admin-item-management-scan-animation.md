# Admin Item Management + Scan Animation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin delete and edit (name + price) ledger items from the phone, and add a sweeping red scan-line animation over the camera preview.

**Architecture:** Add a hard-`delete` to the waste-item repository (cascading the FK-referencing `price_check` and `job` rows) and a `DELETE /api/items/:id` route. Edit reuses the existing `PATCH /api/items/:id`. The PWA frontend gains an inline per-row editor (name + price + Save + Delete) and a CSS scan-line overlay.

**Tech Stack:** TypeScript, Fastify, built-in `node:sqlite`, Vitest, vanilla PWA (HTML/CSS/JS).

**Spec:** `docs/superpowers/specs/2026-06-08-admin-item-management-scan-animation-design.md`

---

## Conventions

- Money is integer cents in the DB; the UI shows/edits dollars.
- TDD for the repo and route (failing test → run → implement → run → commit). The frontend (`public/*`) has no unit tests — it is verified by build + manual phone check + a deploy.
- Commit with `git -c user.name="Chris" -c user.email="you@example.com" commit -m "..."` (git identity is not global).

## File Structure

- `src/db/repositories/wasteItems.ts` — add `delete(id)`.
- `src/db/repositories/wasteItems.test.ts` — add delete tests.
- `src/http/routes/items.ts` — add `DELETE /api/items/:id` (edit PATCH already exists).
- `src/http/routes/items.test.ts` — add DELETE route tests.
- `public/index.html` — wrap `#video` in `#scanwrap` with a `.scanline` overlay.
- `public/styles.css` — `.scanline` keyframes + inline-editor styles.
- `public/app.js` — scan-overlay toggle; inline editor (render, open/close, save, delete); HTML-escape helper.

---

## Task 1: Repository `delete` (hard delete + cascade)

**Files:**
- Modify: `src/db/repositories/wasteItems.ts`
- Test: `src/db/repositories/wasteItems.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("WasteItemsRepo", ...)` block in `src/db/repositories/wasteItems.test.ts` (the file's `beforeEach` already creates `db` and `repo`):

```ts
  it("delete removes the item and its dependent price_check + job rows", () => {
    const id = repo.create({ grocer: "kroger", capture_type: "barcode" }, "2026-06-08T00:00:00Z");
    db.prepare("INSERT INTO price_check (item_id, source, raw_result, success, ran_at) VALUES (?,?,?,?,?)")
      .run(id, "api", "{}", 1, "2026-06-08T00:00:01Z");
    db.prepare("INSERT INTO job (item_id, run_after) VALUES (?,?)").run(id, "2026-06-08T00:00:00Z");

    expect(repo.delete(id)).toBe(true);
    expect(repo.get(id)).toBeUndefined();
    expect((db.prepare("SELECT COUNT(*) c FROM price_check WHERE item_id=?").get(id) as any).c).toBe(0);
    expect((db.prepare("SELECT COUNT(*) c FROM job WHERE item_id=?").get(id) as any).c).toBe(0);
  });

  it("delete returns false when the item does not exist", () => {
    expect(repo.delete(999)).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/db/repositories/wasteItems.test.ts`
Expected: FAIL — `repo.delete is not a function`.

- [ ] **Step 3: Implement `delete`**

In `src/db/repositories/wasteItems.ts`, add this method to the `WasteItemsRepo` class (e.g. after `setPhotoPath`):

```ts
  delete(id: number): boolean {
    // Remove FK-referencing rows first (price_check.item_id, job.item_id both
    // reference waste_item(id)). node:sqlite has no .transaction() helper.
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM price_check WHERE item_id=?").run(id);
      this.db.prepare("DELETE FROM job WHERE item_id=?").run(id);
      const info = this.db.prepare("DELETE FROM waste_item WHERE id=?").run(id);
      this.db.exec("COMMIT");
      return Number(info.changes) > 0;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/db/repositories/wasteItems.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/repositories/wasteItems.ts src/db/repositories/wasteItems.test.ts
git commit -m "feat: hard-delete waste item with cascade to price_check + job"
```

---

## Task 2: `DELETE /api/items/:id` route

**Files:**
- Modify: `src/http/routes/items.ts`
- Test: `src/http/routes/items.test.ts`

- [ ] **Step 1: Write the failing tests**

Append a new `describe` block in `src/http/routes/items.test.ts` (the file already has `buildApp()` which registers the item routes and exposes the module-scoped `items` repo):

```ts
describe("DELETE /api/items/:id", () => {
  it("rejects without passcode", async () => {
    const app = buildApp();
    const id = items.create({ grocer: "kroger", capture_type: "barcode" }, "2026-06-08T00:00:00Z");
    const res = await app.inject({ method: "DELETE", url: `/api/items/${id}` });
    expect(res.statusCode).toBe(401);
  });
  it("404s when the item does not exist", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "DELETE", url: "/api/items/999", headers: { "x-passcode": "secret" } });
    expect(res.statusCode).toBe(404);
  });
  it("deletes an existing item", async () => {
    const app = buildApp();
    const id = items.create({ grocer: "kroger", capture_type: "barcode" }, "2026-06-08T00:00:00Z");
    const res = await app.inject({ method: "DELETE", url: `/api/items/${id}`, headers: { "x-passcode": "secret" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(items.get(id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/http/routes/items.test.ts`
Expected: FAIL — DELETE returns 404 (route not registered) for the success/401 cases.

- [ ] **Step 3: Implement the route**

In `src/http/routes/items.ts`, inside `registerItemRoutes`, add after the existing `app.patch(...)` handler (before the closing brace of the function):

```ts
  app.delete<{ Params: { id: string } }>("/api/items/:id", async (req, reply) => {
    if (!checkPasscode(deps.passcode, req.headers["x-passcode"] as string | undefined)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const existed = deps.items.delete(Number(req.params.id));
    if (!existed) return reply.code(404).send({ error: "not found" });
    return reply.send({ ok: true });
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/http/routes/items.test.ts`
Expected: PASS (existing PATCH tests + 3 new DELETE tests).

- [ ] **Step 5: Run the full suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: all tests pass; tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/http/routes/items.ts src/http/routes/items.test.ts
git commit -m "feat: DELETE /api/items/:id route (passcode-gated, 404 on missing)"
```

---

## Task 3: Scan-line animation overlay (frontend)

**Files:**
- Modify: `public/index.html`, `public/styles.css`, `public/app.js`

No unit tests (static assets). Verified by build + manual check + deploy.

- [ ] **Step 1: Wrap the video in `public/index.html`**

Find this line in the `#capture` section:

```html
      <video id="video" playsinline hidden></video>
```

Replace it with:

```html
      <div id="scanwrap" class="scanwrap" hidden>
        <video id="video" playsinline></video>
        <div class="scanline"></div>
      </div>
```

- [ ] **Step 2: Add the animation CSS to `public/styles.css`**

Append:

```css
.scanwrap { position: relative; }
.scanline {
  position: absolute; left: 6%; right: 6%; height: 2px;
  background: #ff2d2d; box-shadow: 0 0 10px 2px rgba(255, 45, 45, 0.9);
  border-radius: 2px; pointer-events: none;
  animation: scansweep 2.4s ease-in-out infinite;
}
@keyframes scansweep { 0% { top: 8%; } 50% { top: 88%; } 100% { top: 8%; } }
```

- [ ] **Step 3: Toggle the wrapper (not the bare video) in `public/app.js`**

Replace the entire `$("scanBtn").onclick = async () => { ... };` handler (currently lines ~44–60) with:

```js
$("scanBtn").onclick = async () => {
  const video = $("video");
  const wrap = $("scanwrap");
  if (scanning) { reader.reset(); wrap.hidden = true; scanning = false; $("scanBtn").textContent = "📷 Scan barcode"; return; }
  wrap.hidden = false; scanning = true; $("scanBtn").textContent = "⏹ Stop scanning";
  let handled = false; // ignore the repeated per-frame callbacks; act on the FIRST read only
  reader.decodeFromVideoDevice(null, video, async (result) => {
    if (!result || handled) return;
    handled = true;
    // Auto-close the camera after the first successful scan — reopen to scan the next item.
    reader.reset();
    wrap.hidden = true; scanning = false; $("scanBtn").textContent = "📷 Scan barcode";
    const code = result.getText();
    navigator.vibrate?.(80);
    $("captureStatus").textContent = `Logged barcode ${code} ✓ (pricing…)`;
    await postCapture({ grocer, capture_type: "barcode", barcode: code });
  });
};
```

- [ ] **Step 4: Verify it builds / typechecks (no TS in public, but confirm nothing else broke)**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exit 0; all tests still pass (no server code changed).

- [ ] **Step 5: Manual smoke (local, optional now — full check after deploy)**

Run: `npm run dev`, open `http://localhost:8080`, unlock, tap **Scan barcode**. Expected: the preview area shows the red line sweeping up/down; tapping **Stop scanning** (or a successful scan) hides it. (Camera permission needs HTTPS on a phone; on desktop the wrapper still shows and the line animates over the video element.)

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/styles.css public/app.js
git commit -m "feat: sweeping red scan-line animation over the camera preview"
```

---

## Task 4: Inline item editor (name + price + delete)

**Files:**
- Modify: `public/app.js`, `public/styles.css`

No unit tests (frontend). Verified by build + manual check + deploy.

- [ ] **Step 1: Add an HTML-escape helper in `public/app.js`**

Add near the bottom, next to `const fmt = ...`:

```js
function esc(s) {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
```

- [ ] **Step 2: Replace `renderItem` to include the inline editor**

Replace the existing `renderItem` function (currently lines ~100–106) with:

```js
function renderItem(i) {
  const price = i.price_cents == null
    ? `<span class="pending">pending…</span>`
    : `${fmt(i.price_cents)} <span class="muted">(${i.price_source})</span>`;
  const dollars = i.price_cents == null ? "" : (i.price_cents / 100).toFixed(2);
  const name = esc(i.product_name);
  return `<div class="item-wrap">
    <div class="item" data-row="${i.id}">
      <span>${name || "…"} <span class="muted">${i.grocer}</span></span>
      <span>${price}</span>
    </div>
    <div class="editor" id="ed-${i.id}" hidden>
      <label>Name<input type="text" id="edname-${i.id}" value="${name}"></label>
      <label>Price ($)<input type="text" inputmode="decimal" id="edprice-${i.id}" value="${dollars}"></label>
      <div class="editor-row">
        <button class="ed-save" data-save="${i.id}">Save</button>
        <button class="ed-del" data-del="${i.id}">Delete</button>
      </div>
    </div>
  </div>`;
}
```

- [ ] **Step 3: Rebind the ledger row handlers in `loadLedger`**

In `loadLedger` (in `public/app.js`), replace this line:

```js
  for (const el of document.querySelectorAll("[data-edit]")) el.onclick = () => editPrice(Number(el.dataset.edit));
```

with:

```js
  for (const el of document.querySelectorAll("[data-row]")) el.onclick = () => toggleEditor(Number(el.dataset.row));
  for (const el of document.querySelectorAll("[data-save]")) el.onclick = (e) => { e.stopPropagation(); saveItem(Number(el.dataset.save)); };
  for (const el of document.querySelectorAll("[data-del]")) el.onclick = (e) => { e.stopPropagation(); deleteItem(Number(el.dataset.del)); };
```

- [ ] **Step 4: Replace `editPrice` with the editor functions**

Replace the entire `editPrice` function (currently lines ~108–113) with:

```js
function toggleEditor(id) {
  const ed = $(`ed-${id}`);
  const wasOpen = !ed.hidden;
  for (const e of document.querySelectorAll(".editor")) e.hidden = true; // only one open at a time
  ed.hidden = wasOpen; // closed -> open; open -> closed
}

async function saveItem(id) {
  const name = $(`edname-${id}`).value.trim();
  const price = $(`edprice-${id}`).value.trim();
  const body = { product_name: name };
  if (price) body.priceDollars = price; // omit when blank so an unpriced item isn't forced to $0
  const res = await fetch(`/api/items/${id}`, { method: "PATCH", headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) return alert("Save failed");
  loadLedger();
}

async function deleteItem(id) {
  if (!confirm("Delete this item? This can't be undone.")) return;
  const res = await fetch(`/api/items/${id}`, { method: "DELETE", headers: headers() });
  if (!res.ok) return alert("Delete failed");
  loadLedger();
}
```

- [ ] **Step 5: Add editor styles to `public/styles.css`**

Append:

```css
.item { cursor: pointer; }
.editor { padding: 10px 12px; background: #181818; border-bottom: 1px solid #222; display: flex; flex-direction: column; gap: 8px; }
.editor[hidden] { display: none; }
.editor label { display: flex; flex-direction: column; font-size: 12px; color: #aaa; gap: 4px; }
.editor input { padding: 10px; border-radius: 8px; border: 1px solid #333; background: #111; color: #eee; font-size: 16px; }
.editor-row { display: flex; gap: 8px; margin-top: 4px; }
.ed-save { flex: 1; padding: 12px; border: none; border-radius: 8px; background: #b00020; color: #fff; font-size: 15px; }
.ed-del { padding: 12px 16px; border: 1px solid #b00020; border-radius: 8px; background: transparent; color: #ff6b6b; font-size: 15px; }
```

(`font-size: 16px` on inputs prevents iOS Safari from zooming on focus.)

- [ ] **Step 6: Verify nothing server-side broke**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run`
Expected: tsc exit 0; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add public/app.js public/styles.css
git commit -m "feat: inline ledger item editor (edit name + price, delete)"
```

---

## Task 5: Verify + deploy

**Files:** none (verification + deploy).

- [ ] **Step 1: Full suite + typecheck + build**

Run: `npx vitest run && npx tsc --noEmit -p tsconfig.json && npm run build`
Expected: all tests pass; tsc exit 0; build succeeds (emits `dist/src/index.js`).

- [ ] **Step 2: Local manual smoke**

Run `npm run dev`, open `http://localhost:8080`, unlock. Go to the Ledger tab (after capturing/seeding at least one item):
- Tap a row → editor expands with Name + Price prefilled.
- Change the name and price → **Save** → row updates, price shows `(manual)`.
- Tap a row → **Delete** → confirm → row disappears and totals update.
- On the Capture tab, **Scan barcode** shows the sweeping red line; stop hides it.
Expected: all behaviors as described.

- [ ] **Step 3: Push (auto-deploys via the existing GitHub Action)**

```bash
git push origin main
```
Expected: the `Deploy to Fly` Action builds and deploys. (Or deploy directly: `"C:/Users/chris/.fly/bin/flyctl.exe" deploy -a foodwaster --remote-only`.)

- [ ] **Step 4: Verify on the live URL**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://foodwaster.fly.dev/            # 200
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE https://foodwaster.fly.dev/api/items/999   # 401 (no passcode) — confirms route exists & is gated
```
Then open the app on the phone and confirm the editor, delete, and scan animation work over HTTPS.

---

## Self-Review Notes (author)

- **Spec coverage:** delete repo+route ✓ (Tasks 1–2); edit reuses existing PATCH, frontend editor ✓ (Task 4); scan animation Style A ✓ (Task 3); tests for repo + route ✓; manual frontend verification + deploy ✓ (Task 5).
- **Placeholders:** none — every code step has full code.
- **Type/name consistency:** `delete(id): boolean` used identically in repo (Task 1), route (Task 2), and tests; frontend ids `ed-<id>`, `edname-<id>`, `edprice-<id>`, and data-attrs `data-row/data-save/data-del` are consistent between `renderItem` (Step 2) and the handlers (Steps 3–4). `#scanwrap` is consistent between index.html (Task 3.1) and app.js (Task 3.3).
- **FK note:** `delete` removes `price_check` and `job` rows before `waste_item` because `foreign_keys = ON` (set in `openDb`); deleting the parent first would throw.
