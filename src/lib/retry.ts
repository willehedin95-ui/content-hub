/**
 * Generic retry utility with exponential backoff.
 * Use for all external API calls (Kie AI, OpenAI, Meta, Cloudflare, Google Drive).
 */

interface RetryOptions {
  /** Max number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Initial delay in ms before first retry. Default: 1000 */
  initialDelayMs?: number;
  /** Maximum delay in ms. Default: 10000 */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff. Default: 2 */
  backoffFactor?: number;
  /** Abort signal to cancel retries. */
  signal?: AbortSignal;
  /** Optional predicate: return true if the error is retryable. Default: retries on all errors. */
  isRetryable?: (error: unknown) => boolean;
}

/**
 * Default retryable check: retries on network errors and 429/5xx HTTP status codes.
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Network errors
    if (msg.includes("fetch failed") || msg.includes("econnreset") || msg.includes("etimedout") || msg.includes("network")) {
      return true;
    }
    // Rate limits and server errors (check for status codes in message)
    if (msg.includes("429") || msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504")) {
      return true;
    }
    if (msg.includes("rate limit") || msg.includes("too many requests")) {
      return true;
    }
  }
  return false;
}

/**
 * Execute a function with retry and exponential backoff.
 *
 * @example
 * const result = await withRetry(() => fetch(url), { maxAttempts: 3 });
 *
 * @example
 * const data = await withRetry(
 *   () => openai.chat.completions.create({ ... }),
 *   { maxAttempts: 3, isRetryable: isTransientError }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 10_000,
    backoffFactor = 2,
    signal,
    isRetryable = isTransientError,
  } = options ?? {};

  let lastError: unknown;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (signal?.aborted) {
        throw new Error("Retry aborted");
      }
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on last attempt or non-retryable errors
      if (attempt === maxAttempts || !isRetryable(error)) {
        throw error;
      }

      // Wait with exponential backoff
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, delay);
        signal?.addEventListener("abort", () => {
          clearTimeout(timeout);
          resolve(undefined);
        }, { once: true });
      });

      delay = Math.min(delay * backoffFactor, maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Fetch wrapper with timeout and retry.
 * Adds an AbortController timeout to native fetch, then retries on transient errors.
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit & { timeoutMs?: number; retryOptions?: RetryOptions }
): Promise<Response> {
  const { timeoutMs = 30_000, retryOptions, ...fetchOptions } = options ?? {};

  return withRetry(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    // Merge any existing signal
    if (fetchOptions.signal) {
      fetchOptions.signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const res = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      // Treat 429 and 5xx as retryable errors
      if (res.status === 429 || res.status >= 500) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      }

      return res;
    } finally {
      clearTimeout(timeout);
    }
  }, retryOptions);
}
