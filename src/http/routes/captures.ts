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
      deps.items.setPhotoPath(id, path);
    }
    deps.queue.enqueue(id, now);
    return reply.code(201).send(deps.items.get(id));
  });
}
