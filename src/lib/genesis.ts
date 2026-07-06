/**
 * Genesis (Copy Coders / OpenClaw) trained-bot API client.
 *
 * DRAFT SCAFFOLD - built 2026-06-18 (overnight). Not yet imported by any route.
 * Validated against the live API + the official genesis-bots reference skill.
 *
 * Genesis serves 146 trained bots over an OpenAI-compatible API. The `model` field is a
 * BOT SLUG (not an LLM name); each bot carries a server-side system prompt (Copy Coders'
 * copywriting IP). You send user/assistant messages only - `system` messages are dropped.
 * You pay for the underlying model run via your own provider key (Anthropic or OpenRouter).
 *
 * Endpoint:  GET  $GENESIS_BASE_URL/models           -> live roster
 *            POST $GENESIS_BASE_URL/chat/completions  -> call a bot
 * Headers:   Authorization: Bearer $GENESIS_API_KEY
 *            X-Provider-Key: <provider key>           (the key that actually runs the model)
 * Limits:    1 concurrent stream per key, 60 req/min per key. Sequential per key.
 *
 * Env (read from process.env; in scripts, load .env.local first):
 *   GENESIS_API_KEY        gen_...   (the portal)
 *   GENESIS_BASE_URL       https://gas.copycoders.ai/api/v1
 *   GENESIS_PROVIDER_KEY   sk-or-... (OpenRouter)  -- takes precedence if set
 *   ANTHROPIC_API_KEY      sk-ant-... (fallback provider key)
 */

const DEFAULT_BASE_URL = "https://gas.copycoders.ai/api/v1";

export interface GenesisMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CallOptions {
  temperature?: number;
  maxTokens?: number;
  /** Retries on 429 / 5xx (default 3). */
  retries?: number;
  /**
   * Per-call fetch timeout in ms (default 120s - generous for the Opus bots, but a hung
   * upstream call must fail instead of stalling the global per-process queue forever).
   */
  timeoutMs?: number;
}

export class GenesisError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
  ) {
    super(message);
    this.name = "GenesisError";
  }
}

function baseUrl(): string {
  let base = (process.env.GENESIS_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  if (!base.endsWith("/api/v1")) base = base + "/api/v1";
  return base;
}

function genesisKey(): string {
  const k = process.env.GENESIS_API_KEY;
  if (!k) throw new GenesisError("GENESIS_API_KEY is not set");
  return k;
}

function providerKey(): string {
  // OpenRouter key takes precedence (Copy Coders' recommended billing path), else Anthropic.
  const k = process.env.GENESIS_PROVIDER_KEY || process.env.ANTHROPIC_API_KEY;
  if (!k) throw new GenesisError("No provider key (set GENESIS_PROVIDER_KEY or ANTHROPIC_API_KEY)");
  return k;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${genesisKey()}`,
    "X-Provider-Key": providerKey(),
    "Content-Type": "application/json",
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Genesis allows only ONE concurrent stream per key. Serialize all calls in this process
 * through a single promise chain so we never trip the 429 connection_limit_error. (For real
 * parallelism, use multiple provider keys - out of scope for this scaffold.)
 */
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  // keep the chain alive regardless of individual outcomes
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Call a single Genesis bot (non-streaming) and return the assistant text.
 * Serialized through the per-process queue; retries 429/5xx with backoff.
 */
export async function callGenesisBot(
  slug: string,
  messages: GenesisMessage[] | string,
  opts: CallOptions = {},
): Promise<string> {
  const msgs: GenesisMessage[] =
    typeof messages === "string" ? [{ role: "user", content: messages }] : messages;
  const retries = opts.retries ?? 3;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  return enqueue(async () => {
    let lastErr: GenesisError | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      let res: Response;
      try {
        res = await fetch(`${baseUrl()}/chat/completions`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            model: slug,
            messages: msgs,
            stream: false,
            ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
            ...(opts.maxTokens != null ? { max_tokens: opts.maxTokens } : {}),
          }),
          // Hard cap per call: without it one hung request blocks the serialized
          // queue (and every waiting caller) until the platform kills the process.
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        const name = (e as Error)?.name;
        if (name === "TimeoutError" || name === "AbortError") {
          throw new GenesisError(
            `Genesis ${slug} timed out after ${Math.round(timeoutMs / 1000)}s`,
            undefined,
            "timeout",
          );
        }
        throw new GenesisError(`Genesis ${slug} network error: ${(e as Error)?.message ?? String(e)}`);
      }

      if (res.ok) {
        const json = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          error?: { message?: string; type?: string };
        };
        if (json.error) throw new GenesisError(json.error.message || "stream error", res.status, json.error.type);
        const content = json.choices?.[0]?.message?.content ?? "";
        if (!content) throw new GenesisError("Genesis returned empty content (check provider key / quota)");
        return content;
      }

      // Error path
      const body = await res.text().catch(() => "");
      const msg = `Genesis ${slug} -> HTTP ${res.status}: ${body.slice(0, 300)}`;
      lastErr = new GenesisError(msg, res.status);

      // 429 (rate / concurrency) and 5xx are retryable
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1500 * (attempt + 1));
        continue;
      }
      throw lastErr;
    }
    throw lastErr ?? new GenesisError(`Genesis ${slug} failed`);
  });
}
