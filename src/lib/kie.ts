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

// --- Sora 2 Pro Storyboard (image-to-video, no text prompt) ---

export type StoryboardDuration = "10" | "15" | "25";
export type StoryboardAspectRatio = "portrait" | "landscape";

export async function createStoryboardTask(
  imageUrls: string[],
  duration: StoryboardDuration = "15",
  aspectRatio: StoryboardAspectRatio = "portrait"
): Promise<string> {
  if (!imageUrls.length) throw new Error("At least one image URL is required for storyboard");

  return withRetry(
    async () => {
      const res = await fetch(`${KIE_API_BASE}/createTask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
          model: "sora-2-pro-storyboard",
          input: {
            n_frames: duration,
            image_urls: imageUrls,
            aspect_ratio: aspectRatio,
            upload_method: "s3",
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Kie.ai Storyboard createTask failed (${res.status}): ${text}`);
      }

      const data: CreateTaskResponse = await res.json();
      if (data.code !== 200) {
        throw new Error(`Kie.ai Storyboard createTask error: ${data.msg}`);
      }

      return data.data.taskId;
    },
    { maxAttempts: 3, initialDelayMs: 2000, isRetryable: isTransientError }
  );
}

// --- Kling 3.0 (text-to-video with optional start frame + sound) ---

export interface KlingParams {
  prompt: string;
  imageUrls?: string[];
  multiShots?: boolean;
  sound?: boolean;
  duration?: number;
  aspectRatio?: string;
  mode?: "std" | "pro";
}

export async function createKlingTask(params: KlingParams): Promise<string> {
  const {
    prompt,
    imageUrls = [],
    multiShots = false,
    sound = true,
    duration = 15,
    aspectRatio = "9:16",
    mode = "std",
  } = params;

  if (!prompt) throw new Error("Prompt is required for Kling 3.0");

  return withRetry(
    async () => {
      const res = await fetch(`${KIE_API_BASE}/createTask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getApiKey()}`,
        },
        body: JSON.stringify({
          model: "kling-3.0/video",
          input: {
            prompt,
            ...(imageUrls.length > 0 && { image_urls: imageUrls }),
            multi_shots: multiShots,
            sound,
            duration,
            aspect_ratio: aspectRatio,
            mode,
          },
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Kie.ai Kling createTask failed (${res.status}): ${text}`);
      }

      const data: CreateTaskResponse = await res.json();
      if (data.code !== 200) {
        throw new Error(`Kie.ai Kling createTask error: ${data.msg}`);
      }

      return data.data.taskId;
    },
    { maxAttempts: 3, initialDelayMs: 2000, isRetryable: isTransientError }
  );
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

// --- Gemini (direct Google API via @google/genai) ---

import { GoogleGenAI } from "@google/genai";

function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY environment variable is not set");
  return key;
}

/**
 * Analyze a video with Gemini using Google's direct API.
 * Uploads the video via the File API (required for video input),
 * polls until processed, then sends the analysis prompt.
 */
export async function callGeminiVideo(
  videoUrl: string,
  systemPrompt: string,
  userPrompt: string
): Promise<{ text: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });

  // Step 1: Download video from public URL
  console.log("[callGeminiVideo] Downloading video from:", videoUrl.slice(0, 100));
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) throw new Error(`Failed to download video: ${videoRes.status}`);
  const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
  const contentType = videoRes.headers.get("content-type") || "video/mp4";

  // Step 2: Upload to Gemini File API
  console.log("[callGeminiVideo] Uploading to Gemini File API...", `${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB`);
  const uploadResult = await ai.files.upload({
    file: new Blob([videoBuffer], { type: contentType }),
    config: { mimeType: contentType },
  });

  if (!uploadResult.name) throw new Error("Gemini file upload returned no file name");

  // Step 3: Poll until file is processed (ACTIVE state)
  let fileState = uploadResult;
  let pollAttempts = 0;
  const maxPollAttempts = 60; // 2 minutes max
  while (fileState.state === "PROCESSING") {
    if (pollAttempts++ >= maxPollAttempts) {
      throw new Error("Gemini file processing timed out after 2 minutes");
    }
    await new Promise((r) => setTimeout(r, 2000));
    fileState = await ai.files.get({ name: uploadResult.name! });
  }

  if (fileState.state !== "ACTIVE") {
    throw new Error(`Gemini file processing failed: state=${fileState.state}`);
  }
  console.log("[callGeminiVideo] File ready:", fileState.name, "URI:", fileState.uri);

  // Step 4: Generate content with the video
  const result = await ai.models.generateContent({
    model: "gemini-2.5-pro",
    config: {
      systemInstruction: systemPrompt,
    },
    contents: [
      {
        role: "user",
        parts: [
          { fileData: { fileUri: fileState.uri!, mimeType: contentType } },
          { text: userPrompt },
        ],
      },
    ],
  });

  const text = result.text ?? "";
  const usage = result.usageMetadata;

  if (!text) {
    console.error("[callGeminiVideo] Empty response. Finish reason:", result.candidates?.[0]?.finishReason);
  }

  // Clean up uploaded file (fire-and-forget)
  ai.files.delete({ name: uploadResult.name! }).catch(() => {});

  return {
    text,
    usage: {
      promptTokens: usage?.promptTokenCount ?? 0,
      completionTokens: usage?.candidatesTokenCount ?? 0,
      totalTokens: usage?.totalTokenCount ?? 0,
    },
  };
}
