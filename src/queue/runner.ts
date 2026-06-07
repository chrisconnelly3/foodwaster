import type { WasteItem } from "../types.js";
import type { WasteItemsRepo } from "../db/repositories/wasteItems.js";
import type { JobQueue } from "./jobQueue.js";
import { onProcessError } from "./worker.js";

const BACKOFF_MS = [0, 60_000, 300_000]; // attempt 0->1min, 1->5min

export async function runOnce(
  q: JobQueue, items: WasteItemsRepo,
  process: (item: WasteItem) => Promise<void>, now: () => string,
): Promise<boolean> {
  const job = q.claimNext(now());
  if (!job) return false;
  const item = items.get(job.item_id);
  if (!item) { q.complete(job.id); return true; }
  try {
    await process(item);
    q.complete(job.id);
  } catch {
    const decision = onProcessError(item, job.attempts, { items });
    if (decision === "failed") { q.complete(job.id); }
    else {
      const delay = BACKOFF_MS[Math.min(job.attempts, BACKOFF_MS.length - 1)];
      q.retry(job.id, new Date(Date.parse(now()) + delay).toISOString());
    }
  }
  return true;
}

export function startRunner(
  q: JobQueue, items: WasteItemsRepo,
  process: (item: WasteItem) => Promise<void>, intervalMs = 3000,
): () => void {
  const timer = setInterval(async () => {
    try { while (await runOnce(q, items, process, () => new Date().toISOString())) { /* drain */ } }
    catch { /* swallow; next tick retries */ }
  }, intervalMs);
  return () => clearInterval(timer);
}
