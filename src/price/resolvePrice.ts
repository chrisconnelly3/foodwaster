import type { PriceQuery, PriceResult } from "./types.js";
import { withTimeout } from "../util/timeout.js";

export interface ResolveDeps {
  source: (q: PriceQuery) => Promise<PriceResult | null>; // grocer-specific
  estimate: (q: PriceQuery) => Promise<PriceResult | null>;
}

export interface ResolveOpts {
  timeoutMs?: number; // hard cap per step so a hung scrape/API can never stall the worker
}

const DEFAULT_TIMEOUT_MS = 20_000;

export async function resolvePrice(q: PriceQuery, deps: ResolveDeps, opts: ResolveOpts = {}): Promise<PriceResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let viaSource: PriceResult | null = null;
  let sourceError: unknown;
  try { viaSource = await withTimeout(Promise.resolve(deps.source(q)), timeoutMs); }
  catch (err) { sourceError = err; }
  if (viaSource) return viaSource;
  let viaEstimate: PriceResult | null = null;
  let estimateError: unknown;
  try { viaEstimate = await withTimeout(Promise.resolve(deps.estimate(q)), timeoutMs); }
  catch (err) { estimateError = err; }
  if (viaEstimate) return viaEstimate;
  throw sourceError ?? estimateError ?? new Error("price unresolved");
}
