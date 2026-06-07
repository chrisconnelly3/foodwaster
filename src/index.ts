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
import { registerCheaperRoutes } from "./http/routes/cheaper.js";
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
  from: cfg.emailFrom, to: () => settings.get("wife_email", cfg.wifeEmail), tz: cfg.tz,
});

const app = buildServer({
  registerRoutes: (a) => {
    registerCaptureRoutes(a, { items, queue, dataDir: cfg.dataDir, passcode: cfg.passcode, now: () => new Date().toISOString() });
    registerLedgerRoutes(a, { items, passcode: cfg.passcode, tz: cfg.tz, now: () => new Date() });
    registerItemRoutes(a, { items, passcode: cfg.passcode });
    registerSettingsRoutes(a, { settings, passcode: cfg.passcode });
    registerEmailRoutes(a, { passcode: cfg.passcode, sendReport, now: () => new Date() });
    registerCheaperRoutes(a, { items, passcode: cfg.passcode, cfg, estimate: (q) => estimatePrice(q, anthropic) });
  },
});

// Daily 13:00 UTC: fire any due weekly/monthly reports (respecting toggles).
cron.schedule("0 13 * * *", async () => {
  const now = new Date();
  const due = dueReports(now, cfg.tz, (pt, ps) => emailLog.alreadySent(pt, ps));
  for (const d of due) {
    if (d.periodType === "weekly" && settings.get("weekly_enabled", "true") !== "true") continue;
    if (d.periodType === "monthly" && settings.get("monthly_enabled", "true") !== "true") continue;
    await sendReport(d.periodType, new Date(d.periodStart));
  }
});

const port = Number(process.env.PORT ?? 8080);
app.listen({ port, host: "0.0.0.0" }).then(() => {
  app.log.info(`FoodWaster on :${port}`);
});

process.on("SIGTERM", () => { stopRunner(); db.close(); process.exit(0); });
