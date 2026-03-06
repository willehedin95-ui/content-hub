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
  resolution: string = "1K"
): Promise<string> {
  const input: Record<string, unknown> = {
    prompt,
    image_input: imageUrls,
    aspect_ratio: aspectRatio,
    resolution,
    output_format: "png",
  };

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
  aspectRatio: string = "2:3"
): Promise<{ urls: string[]; costTimeMs: number | null }> {
  const taskId = await createImageTask(prompt, imageUrls, aspectRatio, "1K");
  return pollTaskResult(taskId);
}

// --- Video Generation ---

export type VideoModel = "sora-2-pro-text-to-video" | "veo3" | "veo3_fast";

export type VeoGenerationType = "TEXT_2_VIDEO" | "FIRST_AND_LAST_FRAMES_2_VIDEO" | "REFERENCE_2_VIDEO";

export interface VideoGenerationParams {
  model?: VideoModel;
  // Sora 2 Pro params
  size?: "standard" | "high";
  n_frames?: "10" | "15";
  // Veo 3 params
  aspect_ratio?: "9:16" | "16:9";
  generationType?: VeoGenerationType;
  imageUrls?: string[];
}

// --- Sora 2 Pro ---

export async function createSoraTask(
  prompt: string,
  params: VideoGenerationParams = {}
): Promise<string> {
  const input: Record<string, unknown> = {
    prompt,
    size: params.size ?? "standard",
    n_frames: params.n_frames ?? "10",
  };

  return withRetry(
    async () => {
      const res = await fetch(`${KIE_API_BASE}/createTask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
          model: "sora-2-pro-text-to-video",
          input,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Kie.ai Sora createTask failed (${res.status}): ${text}`);
      }

      const data: CreateTaskResponse = await res.json();
      if (data.code !== 200) {
        throw new Error(`Kie.ai Sora createTask error: ${data.msg}`);
      }

      return data.data.taskId;
    },
    { maxAttempts: 3, initialDelayMs: 2000, isRetryable: isTransientError }
  );
}

// --- Veo 3.1 (different endpoint + polling) ---

const VEO_API_BASE = "https://api.kie.ai/api/v1/veo";

interface VeoStatusResponse {
  code: number;
  msg: string;
  data: {
    taskId: string;
    successFlag: 0 | 1 | 2 | 3; // 0=processing, 1=success, 2=failed, 3=created-but-failed
    response: string | Record<string, unknown> | null; // JSON string or parsed object with video URLs when success
    completeTime: number | null;
    createTime: number;
    errorCode: string | null;
    errorMessage: string | null;
  };
}

export async function createVeoTask(
  prompt: string,
  params: VideoGenerationParams = {}
): Promise<string> {
  const model = params.model === "veo3" ? "veo3" : "veo3_fast";

  return withRetry(
    async () => {
      const res = await fetch(`${VEO_API_BASE}/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          aspect_ratio: params.aspect_ratio ?? "9:16",
          ...(params.generationType && { generationType: params.generationType }),
          ...(params.imageUrls?.length && { imageUrls: params.imageUrls }),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Kie.ai Veo createTask failed (${res.status}): ${text}`);
      }

      const data: CreateTaskResponse = await res.json();
      if (data.code !== 200) {
        throw new Error(`Kie.ai Veo createTask error: ${data.msg}`);
      }

      return data.data.taskId;
    },
    { maxAttempts: 3, initialDelayMs: 2000, isRetryable: isTransientError }
  );
}

export async function pollVeoResult(taskId: string): Promise<{ urls: string[]; costTimeMs: number | null }> {
  const startTime = Date.now();
  let pollInterval = POLL_INITIAL_MS;

  while (Date.now() - startTime < MAX_POLL_TIME_MS) {
    const res = await fetch(
      `${VEO_API_BASE}/record-info?taskId=${taskId}`,
      { headers: { Authorization: `Bearer ${getApiKey()}` } }
    );

    if (!res.ok) {
      throw new Error(`Kie.ai Veo poll failed (${res.status})`);
    }

    const data: VeoStatusResponse = await res.json();

    if (data.data.successFlag === 1 && data.data.response) {
      // response can be a JSON string or already-parsed object
      const parsed = typeof data.data.response === "string"
        ? JSON.parse(data.data.response)
        : data.data.response;
      const result = parsed as { resultUrls?: string[]; videoUrl?: string };
      const urls = result.resultUrls ?? (result.videoUrl ? [result.videoUrl] : []);
      const costTimeMs = data.data.completeTime && data.data.createTime
        ? data.data.completeTime - data.data.createTime
        : null;
      return { urls, costTimeMs };
    }

    if (data.data.successFlag === 2 || data.data.successFlag === 3) {
      throw new Error(
        `Kie.ai Veo task failed: ${data.data.errorMessage || "Unknown error"}`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    pollInterval = Math.min(pollInterval * 2, POLL_MAX_MS);
  }

  throw new Error("Kie.ai Veo task timed out after 5 minutes");
}

/** Single status check for a Veo task — no polling loop */
export async function checkVeoStatus(taskId: string): Promise<{
  status: "processing" | "completed" | "failed";
  urls: string[];
  costTimeMs: number | null;
  errorMessage: string | null;
}> {
  const res = await fetch(
    `${VEO_API_BASE}/record-info?taskId=${taskId}`,
    { headers: { Authorization: `Bearer ${getApiKey()}` } }
  );
  if (!res.ok) throw new Error(`Kie.ai Veo check failed (${res.status})`);
  const data: VeoStatusResponse = await res.json();

  if (data.data.successFlag === 1 && data.data.response) {
    const parsed = typeof data.data.response === "string"
      ? JSON.parse(data.data.response)
      : data.data.response;
    const result = parsed as { resultUrls?: string[]; videoUrl?: string };
    const urls = result.resultUrls ?? (result.videoUrl ? [result.videoUrl] : []);
    const costTimeMs = data.data.completeTime && data.data.createTime
      ? data.data.completeTime - data.data.createTime
      : null;
    return { status: "completed", urls, costTimeMs, errorMessage: null };
  }

  if (data.data.successFlag === 2 || data.data.successFlag === 3) {
    return { status: "failed", urls: [], costTimeMs: null, errorMessage: data.data.errorMessage || "Unknown error" };
  }

  return { status: "processing", urls: [], costTimeMs: null, errorMessage: null };
}

/** Single status check for a Nano Banana image task — no polling loop */
export async function checkImageTaskStatus(taskId: string): Promise<{
  status: "processing" | "completed" | "failed";
  urls: string[];
  costTimeMs: number | null;
  errorMessage: string | null;
}> {
  const res = await fetch(
    `${KIE_API_BASE}/recordInfo?taskId=${taskId}`,
    { headers: { Authorization: `Bearer ${getApiKey()}` } }
  );
  if (!res.ok) throw new Error(`Kie.ai image check failed (${res.status})`);
  const data: TaskStatusResponse = await res.json();

  if (data.data.state === "success" && data.data.resultJson) {
    const result = JSON.parse(data.data.resultJson) as { resultUrls: string[] };
    return { status: "completed", urls: result.resultUrls, costTimeMs: data.data.costTime ?? null, errorMessage: null };
  }

  if (data.data.state === "fail") {
    return { status: "failed", urls: [], costTimeMs: null, errorMessage: data.data.failMsg || "Unknown error" };
  }

  return { status: "processing", urls: [], costTimeMs: null, errorMessage: null };
}

// --- Unified interface ---

export async function generateVideo(
  prompt: string,
  params: VideoGenerationParams = {}
): Promise<{ urls: string[]; taskId: string; costTimeMs: number | null }> {
  const model = params.model ?? "sora-2-pro-text-to-video";

  if (model === "veo3" || model === "veo3_fast") {
    const taskId = await createVeoTask(prompt, params);
    const result = await pollVeoResult(taskId);
    return { ...result, taskId };
  }

  // Default: Sora 2 Pro
  const taskId = await createSoraTask(prompt, params);
  const result = await pollTaskResult(taskId);
  return { ...result, taskId };
}
