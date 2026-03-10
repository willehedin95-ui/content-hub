/**
 * Client-side video frame extraction using <video> + <canvas>.
 * Extracts JPEG frames at regular intervals for Claude Vision analysis.
 */

export interface ExtractedFrame {
  timestamp: number;
  blob: Blob;
  dataUrl: string;
}

export interface ExtractionProgress {
  current: number;
  total: number;
  phase: "loading" | "extracting" | "done";
}

interface ExtractOptions {
  maxFrames?: number;
  maxDurationSec?: number;
  quality?: number;
  maxWidth?: number;
  onProgress?: (progress: ExtractionProgress) => void;
}

const DEFAULTS = {
  maxFrames: 20,
  maxDurationSec: 60,
  quality: 0.85,
  maxWidth: 1280,
} as const;

/**
 * Calculate which timestamps to extract frames from.
 * - ≤15s: every 1s
 * - 15-60s: every 2s
 * - Always includes first and last frame
 * - Capped at maxFrames
 */
function calculateTimestamps(duration: number, maxFrames: number): number[] {
  if (duration < 1) return [0];
  if (duration < 3) {
    const mid = duration / 2;
    return [0, mid, duration - 0.1].filter((t) => t >= 0);
  }

  const interval = duration <= 15 ? 1 : 2;
  const timestamps: number[] = [];

  for (let t = 0; t < duration; t += interval) {
    timestamps.push(t);
  }

  // Always include last frame
  const last = duration - 0.1;
  if (timestamps[timestamps.length - 1] < last - 0.5) {
    timestamps.push(last);
  }

  // Cap at maxFrames, keeping even distribution
  if (timestamps.length > maxFrames) {
    const step = (timestamps.length - 1) / (maxFrames - 1);
    const reduced: number[] = [];
    for (let i = 0; i < maxFrames; i++) {
      reduced.push(timestamps[Math.round(i * step)]);
    }
    return reduced;
  }

  return timestamps;
}

/**
 * Extract frames from a video file.
 * Runs entirely in the browser — no server-side dependencies.
 */
export async function extractFrames(
  file: File,
  options?: ExtractOptions
): Promise<ExtractedFrame[]> {
  const {
    maxFrames = DEFAULTS.maxFrames,
    maxDurationSec = DEFAULTS.maxDurationSec,
    quality = DEFAULTS.quality,
    maxWidth = DEFAULTS.maxWidth,
    onProgress,
  } = options ?? {};

  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    // Timeout if metadata never loads
    const metadataTimeout = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "Could not load video metadata. The file may be corrupted or in an unsupported format. Try converting to MP4 (H.264)."
        )
      );
    }, 10_000);

    function cleanup() {
      clearTimeout(metadataTimeout);
      URL.revokeObjectURL(objectUrl);
      video.remove();
    }

    video.onerror = () => {
      cleanup();
      reject(
        new Error(
          "This video format is not supported by your browser. MOV files may not work outside Safari. Please convert to MP4 (H.264)."
        )
      );
    };

    video.onloadedmetadata = async () => {
      clearTimeout(metadataTimeout);

      const duration = video.duration;

      if (!isFinite(duration) || duration < 0.5) {
        cleanup();
        reject(new Error("Video is too short (under 0.5 seconds)."));
        return;
      }

      if (duration > maxDurationSec) {
        cleanup();
        reject(
          new Error(
            `Video is too long (${Math.round(duration)}s). Please trim to under ${maxDurationSec} seconds.`
          )
        );
        return;
      }

      const timestamps = calculateTimestamps(duration, maxFrames);
      onProgress?.({ current: 0, total: timestamps.length, phase: "extracting" });

      // Calculate canvas dimensions (downscale if needed)
      const scale = Math.min(1, maxWidth / video.videoWidth);
      const canvasWidth = Math.round(video.videoWidth * scale);
      const canvasHeight = Math.round(video.videoHeight * scale);

      const canvas = document.createElement("canvas");
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext("2d")!;

      const frames: ExtractedFrame[] = [];

      for (let i = 0; i < timestamps.length; i++) {
        try {
          const frame = await extractSingleFrame(
            video,
            timestamps[i],
            canvas,
            ctx,
            quality
          );
          frames.push(frame);
        } catch {
          // Skip frames that fail to extract (e.g. seek issues)
          console.warn(`Failed to extract frame at ${timestamps[i]}s, skipping`);
        }
        onProgress?.({ current: i + 1, total: timestamps.length, phase: "extracting" });
      }

      onProgress?.({ current: timestamps.length, total: timestamps.length, phase: "done" });
      cleanup();

      if (frames.length === 0) {
        reject(new Error("Could not extract any frames from the video."));
        return;
      }

      resolve(frames);
    };
  });
}

function extractSingleFrame(
  video: HTMLVideoElement,
  timestamp: number,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  quality: number
): Promise<ExtractedFrame> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Seek timeout")), 5_000);

    video.onseeked = () => {
      clearTimeout(timeout);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("toBlob failed"));
            return;
          }
          resolve({ timestamp, blob, dataUrl });
        },
        "image/jpeg",
        quality
      );
    };

    video.currentTime = timestamp;
  });
}

/** Human-readable duration string */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}
