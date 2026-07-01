/**
 * Minimal OpenRouter chat client (OpenAI-compatible).
 *
 * Used for non-Genesis model calls in the Genesis subsystem - the creative judge (Phase 3) and
 * any light structuring/classification. Runs on the same OpenRouter key as the Genesis provider
 * key, so the whole subsystem bills through one place and doesn't depend on the (currently
 * invalid) local ANTHROPIC_API_KEY.
 *
 * Key: OPENROUTER_API_KEY, falling back to GENESIS_PROVIDER_KEY (the sk-or- key already in .env).
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export const JUDGE_MODEL = "anthropic/claude-haiku-4.5";

export interface ORMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ORChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Ask for a JSON object response (OpenRouter passes through to the provider). */
  json?: boolean;
}

function orKey(): string {
  const k = process.env.OPENROUTER_API_KEY || process.env.GENESIS_PROVIDER_KEY;
  if (!k || !k.startsWith("sk-or-")) {
    throw new Error("No OpenRouter key (set OPENROUTER_API_KEY or GENESIS_PROVIDER_KEY=sk-or-...)");
  }
  return k;
}

export async function chatOpenRouter(messages: ORMessage[], opts: ORChatOptions = {}): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${orKey()}`,
      "Content-Type": "application/json",
      "X-Title": "content-hub",
    },
    body: JSON.stringify({
      model: opts.model || JUDGE_MODEL,
      messages,
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens != null ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

/** Vision call: ask a question about an image. Returns the model's text answer. */
export async function visionOpenRouter(
  prompt: string,
  imageUrl: string,
  opts: { model?: string; maxTokens?: number; json?: boolean } = {},
): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${orKey()}`, "Content-Type": "application/json", "X-Title": "content-hub" },
    body: JSON.stringify({
      model: opts.model || "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: opts.maxTokens ?? 600,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter vision ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

/** Parse a JSON object from a model response that may be fenced or have surrounding prose. */
export function parseJsonLoose<T>(raw: string): T {
  let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s) as T;
}
