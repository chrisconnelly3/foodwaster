import type { WasteItem } from "../types.js";
import type { WasteItemsRepo } from "../db/repositories/wasteItems.js";
import type { JobQueue } from "./jobQueue.js";
import { onProcessError } from "./worker.js";

const BACKOFF_MS = [5_000, 60_000]; // attempt 0 -> 5s, attempt 1 -> 60s (attempt 2 -> failed, no retry)

// A claim older than this is assumed orphaned by a dead worker and may be re-claimed.
const VISIBILITY_TIMEOUT_MS = 120_000;

export async function runOnce(
  q: JobQueue, items: WasteItemsRepo,
  process: (item: WasteItem) => Promise<void>, now: () => string,
  visibilityMs: number = VISIBILITY_TIMEOUT_MS,
): Promise<boolean> {
  const nowIso = now();
  const staleBeforeIso = new Date(Date.parse(nowIso) - visibilityMs).toISOString();
  const job = q.claimNext(nowIso, staleBeforeIso);
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
  let running = false; // prevent overlapping ticks: a slow job must not let the next tick
                       // start a second concurrent drain (that caused concurrent Chromium -> OOM)
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { while (await runOnce(q, items, process, () => new Date().toISOString())) { /* drain */ } }
    catch { /* swallow; next tick retries */ }
    finally { running = false; }
  }, intervalMs);
  return () => clearInterval(timer);
}
