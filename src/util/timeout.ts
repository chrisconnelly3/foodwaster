export class TimeoutError extends Error {
  constructor(ms: number) { super(`timed out after ${ms}ms`); this.name = "TimeoutError"; }
}

/**
 * Reject if `p` doesn't settle within `ms`. The underlying promise is NOT cancelled
 * (JS can't), but the caller stops waiting — used to stop a hung scrape/API call from
 * stalling the worker. The timer is cleared once `p` settles so it never leaks.
 */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
