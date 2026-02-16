// GPT-4o pricing (per 1M tokens)
export const GPT4O_INPUT_COST = 2.5; // $/1M input tokens
export const GPT4O_OUTPUT_COST = 10.0; // $/1M output tokens

// Kie.ai nano-banana-pro (per image generation at 2K resolution)
export const KIE_IMAGE_COST = 0.09; // $0.09 per image (18 credits at 2K)

export function calcOpenAICost(
  inputTokens: number,
  outputTokens: number
): number {
  return (
    (inputTokens * GPT4O_INPUT_COST + outputTokens * GPT4O_OUTPUT_COST) /
    1_000_000
  );
}
