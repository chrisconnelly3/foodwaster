import Fastify, { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// Resolve the static `public/` dir robustly across run modes:
// - dev via tsx:        here = src/http        -> ../../public = <root>/public
// - built via node:     here = dist/src/http   -> ../../public = dist/public (does NOT exist)
// Prefer <cwd>/public (the app always runs from the project root / container WORKDIR),
// falling back to the source-relative path for unusual launch dirs.
function resolvePublicDir(): string {
  const cwdPublic = join(process.cwd(), "public");
  if (existsSync(cwdPublic)) return cwdPublic;
  return join(here, "../../public");
}

export interface ServerCtx {
  registerRoutes: (app: FastifyInstance) => void;
}

// Tolerate an empty application/json body. Safari attaches `Content-Type: application/json`
// (with Content-Length: 0) to body-less requests like DELETE; Fastify's default JSON parser
// rejects that with 400 FST_ERR_CTP_EMPTY_JSON_BODY. Treat empty as `undefined` instead.
export function installJsonParser(app: FastifyInstance): void {
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const text = body as string;
    if (text === "" || text == null) return done(null, undefined);
    try { done(null, JSON.parse(text)); }
    catch (err) { (err as any).statusCode = 400; done(err as Error, undefined); }
  });
}

export function buildServer(ctx: ServerCtx): FastifyInstance {
  const app = Fastify({ logger: true, bodyLimit: 15 * 1024 * 1024 });
  installJsonParser(app);
  app.register(fastifyStatic, { root: resolvePublicDir(), prefix: "/" });
  ctx.registerRoutes(app);
  return app;
}
