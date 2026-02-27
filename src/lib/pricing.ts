// GPT-5.2 pricing (per 1M tokens)
export const GPT4O_INPUT_COST = 2.0; // $/1M input tokens
export const GPT4O_OUTPUT_COST = 8.0; // $/1M output tokens

// Claude Sonnet 4.5 pricing (per 1M tokens)
export const CLAUDE_INPUT_COST = 3.0; // $/1M input tokens
export const CLAUDE_OUTPUT_COST = 15.0; // $/1M output tokens
export const CLAUDE_CACHE_WRITE_COST = 3.75; // $/1M tokens (cache write)
export const CLAUDE_CACHE_READ_COST = 0.30; // $/1M tokens (cache hit — 90% cheaper)

// Kie.ai nano-banana-2 (per image generation at 1K resolution)
export const KIE_IMAGE_COST = 0.045; // $0.045 per image (~9 credits at 1K, $0.005/credit)

export function calcOpenAICost(
  inputTokens: number,
  outputTokens: number
): number {
  return (
    (inputTokens * GPT4O_INPUT_COST + outputTokens * GPT4O_OUTPUT_COST) /
    1_000_000
  );
}

export function calcClaudeCost(
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens = 0,
  cacheReadTokens = 0
): number {
  const uncachedInput = inputTokens - cacheCreationTokens - cacheReadTokens;
  return (
    (uncachedInput * CLAUDE_INPUT_COST +
      outputTokens * CLAUDE_OUTPUT_COST +
      cacheCreationTokens * CLAUDE_CACHE_WRITE_COST +
      cacheReadTokens * CLAUDE_CACHE_READ_COST) /
    1_000_000
  );
}
