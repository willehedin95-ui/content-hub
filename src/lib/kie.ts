import { KIE_MODEL } from "./constants";
import { withRetry, isTransientError } from "./retry";

const KIE_API_BASE = "https://api.kie.ai/api/v1/jobs";
const POLL_INITIAL_MS = 2000;
const POLL_MAX_MS = 10_000;
const MAX_POLL_TIME_MS = 280_000; // ~4.7 min — leaves buffer before Vercel's 300s maxDuration

interface CreateTaskResponse {
  code: number;
  msg: string;
  data: { taskId: string };
}

interface TaskStatusResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
    model: string;
    state: "waiting" | "success" | "fail";
    param: string;
    resultJson: string | null;
    failCode: string | null;
    failMsg: string | null;
    costTime: number | null;
    completeTime: number | null;
    createTime: number;
  };
}

function getApiKey(): string {
  const key = process.env.KIE_AI_API_KEY;
  if (!key) throw new Error("KIE_AI_API_KEY is not set");
  return key;
}

export async function createImageTask(
  prompt: string,
  imageUrls: string[],
  aspectRatio: string = "2:3",
  resolution: string = "2K",
  seed?: number
): Promise<string> {
  const input: Record<string, unknown> = {
    prompt,
    image_input: imageUrls,
    aspect_ratio: aspectRatio,
    resolution,
    output_format: "png",
  };

  if (seed !== undefined) {
    input.seed = seed;
  }

  return withRetry(
    async () => {
      const res = await fetch(`${KIE_API_BASE}/createTask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
          model: KIE_MODEL,
          input,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Kie.ai createTask failed (${res.status}): ${text}`);
      }

      const data: CreateTaskResponse = await res.json();
      if (data.code !== 200) {
        throw new Error(`Kie.ai createTask error: ${data.msg}`);
      }

      return data.data.taskId;
    },
    { maxAttempts: 3, initialDelayMs: 2000, isRetryable: isTransientError }
  );
}

export async function pollTaskResult(taskId: string): Promise<{ urls: string[]; costTimeMs: number | null }> {
  const startTime = Date.now();
  let pollInterval = POLL_INITIAL_MS;

  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    const res = await fetch(
      `${KIE_API_BASE}/recordInfo?taskId=${taskId}`,
      {
        headers: {
          Authorization: `Bearer ${getApiKey()}`,
        },
      }
    );

    if (!res.ok) {
      throw new Error(`Kie.ai poll failed (${res.status})`);
    }

    const data: TaskStatusResponse = await res.json();

    if (data.data.state === "success" && data.data.resultJson) {
      const result = JSON.parse(data.data.resultJson) as {
        resultUrls: string[];
      };
      return { urls: result.resultUrls, costTimeMs: data.data.costTime ?? null };
    }

    if (data.data.state === "fail") {
      throw new Error(
        `Kie.ai task failed: ${data.data.failMsg || "Unknown error"}`
      );
    }

    // Exponential backoff: 2s → 4s → 8s → 10s (capped)
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    pollInterval = Math.min(pollInterval * 2, POLL_MAX_MS);
  }

  throw new Error("Kie.ai task timed out after 5 minutes");
}

export async function getCredits(): Promise<{ balance: number }> {
  return withRetry(
    async () => {
      const res = await fetch("https://api.kie.ai/api/v1/chat/credit", {
        headers: {
          Authorization: `Bearer ${getApiKey()}`,
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Kie.ai balance check failed (${res.status}): ${text}`);
      }

      const data = await res.json();
      return { balance: typeof data.data === "number" ? data.data : 0 };
    },
    { maxAttempts: 2, initialDelayMs: 1000, isRetryable: isTransientError }
  );
}

export async function generateImage(
  prompt: string,
  imageUrls: string[],
  aspectRatio: string = "2:3",
  seed?: number
): Promise<{ urls: string[]; costTimeMs: number | null }> {
  const taskId = await createImageTask(prompt, imageUrls, aspectRatio, "2K", seed);
  return pollTaskResult(taskId);
}
