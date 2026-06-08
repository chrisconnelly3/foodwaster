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
  WHOLE_FOODS_SCRAPE: z.string().optional(), // "true" enables the Playwright scrape; default off -> AI estimate
});

export type Config = {
  tz: string; passcode: string; wifeEmail: string; emailFrom: string; dataDir: string;
  anthropicKey: string; resendKey: string;
  kroger: { clientId?: string; clientSecret?: string; locationId?: string };
  target: { storeId?: string; apiKey?: string };
  wholeFoods: { zip?: string; scrape: boolean };
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const e = schema.parse(env);
  return {
    tz: e.APP_TZ, passcode: e.APP_PASSCODE, wifeEmail: e.WIFE_EMAIL, emailFrom: e.EMAIL_FROM,
    dataDir: e.DATA_DIR, anthropicKey: e.ANTHROPIC_API_KEY, resendKey: e.RESEND_API_KEY,
    kroger: { clientId: e.KROGER_CLIENT_ID, clientSecret: e.KROGER_CLIENT_SECRET, locationId: e.KROGER_LOCATION_ID },
    target: { storeId: e.TARGET_STORE_ID, apiKey: e.TARGET_API_KEY },
    wholeFoods: { zip: e.WHOLE_FOODS_ZIP, scrape: e.WHOLE_FOODS_SCRAPE === "true" },
  };
}
