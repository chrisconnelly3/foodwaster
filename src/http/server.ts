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
