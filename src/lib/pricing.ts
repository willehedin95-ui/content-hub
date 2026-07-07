// GPT-5.2 pricing (per 1M tokens)
export const GPT4O_INPUT_COST = 2.0; // $/1M input tokens
export const GPT4O_OUTPUT_COST = 8.0; // $/1M output tokens

// Claude Sonnet 4.5 pricing (per 1M tokens)
export const CLAUDE_INPUT_COST = 3.0; // $/1M input tokens
export const CLAUDE_OUTPUT_COST = 15.0; // $/1M output tokens
export const CLAUDE_CACHE_WRITE_COST = 3.75; // $/1M tokens (cache write)
export const CLAUDE_CACHE_READ_COST = 0.30; // $/1M tokens (cache hit — 90% cheaper)

// Kie.ai nano-banana-2 (per image generation at 2K resolution — default for static ads)
export const KIE_IMAGE_COST = 0.06; // $0.06 per image (~12 credits at 2K, $0.005/credit)

// Kie.ai nano-banana-2 keyframes at 1K resolution (video swiper start frames).
// TODO: verify against Kie's price list — flat estimate at half the 2K cost.
export const KIE_KEYFRAME_COST = 0.03;

// Kie.ai video generation — flat per-clip estimates for cost visibility in
// usage_logs (previously logged as $0, hiding the most expensive tool spend).
// TODO: verify against Kie's actual price list and replace with exact figures.
export const KIE_VEO3_COST = 1.5; // Veo 3 quality, ~8s clip
export const KIE_VEO3_FAST_COST = 0.4; // Veo 3 Fast, ~8s clip
export const KIE_KLING_COST = 0.5; // Kling 3.0, 5-15s clip w/ sound (builder logs $0.12 for 5s std as reference)

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
