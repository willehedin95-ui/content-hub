import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-5-20250929";
const MAX_ATTEMPTS = 2;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

interface SwipeJob {
  id: string;
  status: string;
  system_prompt: string;
  user_prompt: string;
  attempts: number;
}

/**
 * Process a single swipe job: claim it, stream Claude's response, save result.
 */
export async function processJob(jobId: string): Promise<void> {
  console.log(`[Worker] Processing job ${jobId}`);

  // 1. Read the job
  const { data: job, error: readErr } = await supabase
    .from("swipe_jobs")
    .select("id, status, system_prompt, user_prompt, attempts")
    .eq("id", jobId)
    .single();

  if (readErr || !job) {
    console.error(`[Worker] Job ${jobId} not found:`, readErr?.message);
    return;
  }

  // Only process pending jobs
  if (job.status !== "pending") {
    console.log(`[Worker] Job ${jobId} is ${job.status}, skipping`);
    return;
  }

  // 2. Claim the job (atomic update)
  const { error: claimErr } = await supabase
    .from("swipe_jobs")
    .update({
      status: "processing",
      attempts: (job as SwipeJob).attempts + 1,
      started_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", jobId)
    .eq("status", "pending"); // Optimistic lock

  if (claimErr) {
    console.error(`[Worker] Failed to claim job ${jobId}:`, claimErr.message);
    return;
  }

  try {
    // 3. Stream Claude's response
    const stream = anthropic.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 64000,
      system: (job as SwipeJob).system_prompt,
      messages: [{ role: "user", content: (job as SwipeJob).user_prompt }],
    });

    let outputChars = 0;
    let fullOutput = "";
    let lastUpdateAt = 0;

    stream.on("text", (text) => {
      fullOutput += text;
      outputChars += text.length;

      // Update progress every ~5000 chars
      if (outputChars - lastUpdateAt >= 5000) {
        lastUpdateAt = outputChars;
        const kChars = Math.round(outputChars / 1000);
        supabase
          .from("swipe_jobs")
          .update({
            progress_chars: outputChars,
            progress_message: `Claude writing... (${kChars}k chars)`,
          })
          .eq("id", jobId)
          .then(() => {});
      }
    });

    const response = await stream.finalMessage();
    const rawOutput =
      response.content[0].type === "text" ? response.content[0].text : "";
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    // 4. Save completed result
    const { error: saveErr } = await supabase
      .from("swipe_jobs")
      .update({
        status: "completed",
        raw_output: rawOutput,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        progress_chars: rawOutput.length,
        progress_message: "Completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (saveErr) {
      console.error(`[Worker] Failed to save result for ${jobId}:`, saveErr.message);
      return;
    }

    console.log(
      `[Worker] Job ${jobId} completed: ${inputTokens} in / ${outputTokens} out / ${rawOutput.length} chars`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Worker] Job ${jobId} failed:`, message);

    const currentAttempts = (job as SwipeJob).attempts + 1;

    // If under max attempts, set back to pending for retry
    if (currentAttempts < MAX_ATTEMPTS) {
      await supabase
        .from("swipe_jobs")
        .update({
          status: "pending",
          error_message: message,
          progress_message: `Failed (attempt ${currentAttempts}/${MAX_ATTEMPTS}), will retry...`,
        })
        .eq("id", jobId);

      // Re-trigger processing after a delay
      setTimeout(() => {
        processJob(jobId).catch(() => {});
      }, 5000);
    } else {
      await supabase
        .from("swipe_jobs")
        .update({
          status: "failed",
          error_message: message,
          progress_message: "Failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }
  }
}
