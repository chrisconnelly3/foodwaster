# FoodWaster — Setup & Deploy Guide

A single-user mobile PWA that logs thrown-away groceries, prices them (Kroger API, Target API, Whole Foods scrape, with an AI-estimate fallback), and emails a **monthly** guilt-trip summary.

---

## 1. Environment variables

All config lives in env vars. Locally they go in a `.env` file (gitignored). On a host, you set them in the host's dashboard / secrets.

| Variable | Required | What it is |
|---|---|---|
| `APP_TZ` | yes | Timezone, e.g. `America/Chicago` |
| `APP_PASSCODE` | yes | The code you type to unlock the app on your phone |
| `WIFE_EMAIL` | yes | Where the monthly email goes |
| `EMAIL_FROM` | yes | Bot sender, e.g. `FoodWaster <bot@yourdomain.com>` — domain must be verified in Resend |
| `DATA_DIR` | yes | Where SQLite + photos live. Local: `./data`. Hosted: `/app/data` (the mounted volume) |
| `ANTHROPIC_API_KEY` | yes | Claude — photo ID, price estimates, email copy |
| `RESEND_API_KEY` | yes | Resend — sends the email |
| `KROGER_CLIENT_ID` / `KROGER_CLIENT_SECRET` | optional | Kroger developer app creds |
| `KROGER_LOCATION_ID` | optional | Your Kroger store id (see below) |
| `TARGET_STORE_ID` | optional | Your Target store number |
| `TARGET_API_KEY` | optional | Target redsky public web key (see below) |
| `WHOLE_FOODS_ZIP` | optional | Your zip; helps pick the right store |

> Leave any grocer's vars blank to skip it — that grocer's prices fall back to an AI estimate.
> **On a host, paste values WITHOUT inline `# comments`** — only the local `.env` tolerates those.

### Getting each key

- **Resend** (`RESEND_API_KEY`, `EMAIL_FROM`): resend.com → **Domains** → add + verify your domain (DNS records) → **API Keys** → create. `EMAIL_FROM` must use the verified domain.
- **Anthropic** (`ANTHROPIC_API_KEY`): console.anthropic.com → **API Keys** → create. Add a few dollars of credit (usage here is pennies).
- **Kroger** (`KROGER_CLIENT_ID/SECRET`): developer.kroger.com → register → **My Apps → Add Application** → enable **Products** + **Locations**. Find your `KROGER_LOCATION_ID`:
  ```bash
  TOKEN=$(curl -s -u "CLIENT_ID:CLIENT_SECRET" \
    -d "grant_type=client_credentials&scope=product.compact" \
    https://api.kroger.com/v1/connect/oauth2/token | jq -r .access_token)
  curl -s "https://api.kroger.com/v1/locations?filter.zipCode.near=YOURZIP" \
    -H "Authorization: Bearer $TOKEN" | jq '.data[] | {name, locationId}'
  ```
- **Target** (`TARGET_STORE_ID`, `TARGET_API_KEY`): open target.com (set your store), search a product, **F12 → Network**, filter `redsky`, click a request, copy `pricing_store_id` and `key` from its URL. The `key` is a shared public key — if Target prices go quiet later, grab a fresh one the same way.
- **Whole Foods**: no key. Prices are scraped via Playwright and fall back to AI estimates when blocked (expect this fairly often).

---

## 2. Run locally

Requires **Node ≥ 22** (uses the built-in `node:sqlite`).

```bash
cp .env.example .env     # fill in your values
npm install
npx playwright install chromium   # for the Whole Foods scrape
npm run dev              # http://localhost:8080
```

Unlock with your `APP_PASSCODE`. Note: the **phone camera needs HTTPS**, so barcode/photo capture only works once deployed (or via an HTTPS tunnel like `npx localtunnel --port 8080`).

---

## 3. Deploy permanently

### Option A — Fly.io (cheapest, ~$3–4/mo) ✅ recommended

Install the Fly CLI and `fly auth login`, then from the repo root:

```bash
fly launch --no-deploy --copy-config --name foodwaster   # pick a unique name if taken
fly volumes create foodwaster_data --region dfw --size 1 # 1 GB persistent disk
fly secrets import < deploy/secrets.fly.env              # your keys (gitignored, never committed)
fly deploy
fly open                                                 # opens your HTTPS URL
```

`fly.toml` (committed) keeps the machine always-on (`min_machines_running = 1`) so the monthly cron fires, mounts the volume at `/app/data`, and forces HTTPS. Bump `memory` to `1gb` in `fly.toml` if the Whole Foods scrape OOMs.

### Option B — Render (~$7–8/mo)

Render Dashboard → **New → Blueprint** → connect this repo. `render.yaml` provisions a Starter web service + 1 GB disk. Fill the `sync: false` secret values in the dashboard. (Render's free tier sleeps and has no disk, so it won't work for the always-on cron.)

### Option C — Railway (~$5/mo)

New Project → **Deploy from GitHub repo** → it detects the Dockerfile → add a **Volume** at `/app/data` → add your env vars in **Variables** (no `#` comments) → deploy.

---

## 4. After deploy — phone checklist

1. Open the HTTPS URL on your phone → unlock → **Add to Home Screen**.
2. Pick a grocer → scan a barcode and snap a photo → watch items go **pending → priced**.
3. Tap **Send test email** → confirm it lands (check spam the first time).
4. The real summary auto-sends on the **1st of each month**.

---

## 5. Good to know

- **Cadence is monthly only** by default. To also get weekly emails, `PUT /api/settings` with `{"weekly_enabled":"true"}`.
- **Whole Foods** prices fall back to AI estimates often — by design.
- **Target's key** is a shared public one; refresh it from DevTools if prices stop resolving.
- The ledger + photos live on the mounted volume (`/app/data`) and survive restarts/redeploys.
