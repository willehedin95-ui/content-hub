const windows = new Map<string, number[]>();

/**
 * In-memory sliding-window rate limiter.
 * On Vercel serverless each invocation gets fresh memory,
 * so this primarily guards against burst/concurrent requests within the same instance.
 */
export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs = 60_000
): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const cutoff = now - windowMs;

  let timestamps = windows.get(key);
  if (!timestamps) {
    timestamps = [];
    windows.set(key, timestamps);
  }

  // Prune expired timestamps
  const pruned = timestamps.filter((t) => t > cutoff);
  windows.set(key, pruned);

  if (pruned.length >= maxRequests) {
    const oldest = pruned[0];
    return { allowed: false, retryAfterMs: oldest + windowMs - now };
  }

  pruned.push(now);
  return { allowed: true };
}
