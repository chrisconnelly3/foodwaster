# FoodWaster

Single-user mobile PWA that logs thrown-away groceries, prices them, and emails weekly/monthly guilt-trip summaries.

## Local dev
```bash
cp .env.example .env   # fill in keys
npm install
npm run dev            # http://localhost:8080
```
Camera needs HTTPS — use a tunnel (`npx localtunnel --port 8080`) to test scanning on a phone.

> **Requires Node ≥ 22** (developed on Node 24) — the app uses the built-in `node:sqlite` module which was stabilised in Node 22.

## Required services
- **Anthropic** API key (vision + price estimates + email copy).
- **Resend** API key + verified sender domain for `EMAIL_FROM`.
- **Kroger** developer app: `KROGER_CLIENT_ID`, `KROGER_CLIENT_SECRET`, and a `KROGER_LOCATION_ID` (find via Kroger Locations API for your store).
- **Target**: `TARGET_STORE_ID` (your store) + `TARGET_API_KEY` (public redsky web key). Unofficial; may break.
- **Whole Foods**: no key; scraped via Playwright. `WHOLE_FOODS_ZIP` optional for location context.
- **Email trend chart**: rendered server-side via [QuickChart.io](https://quickchart.io/) — no account or setup needed.

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
