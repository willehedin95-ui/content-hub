import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import OpenAI from "openai";
import { createServerSupabase } from "@/lib/supabase";
import { VIDEO_STORAGE_BUCKET } from "@/lib/constants";

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimedWord {
  word: string;
  start: number; // seconds
  end: number; // seconds
}

export type CaptionStyle = "highlight" | "clean";

/** Shot dialogue + duration for script-based caption generation */
export interface ShotDialogue {
  dialogue: string;
  durationSeconds: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format seconds to ASS timestamp (H:MM:SS.cc — centiseconds) */
function toAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return (
    String(h) +
    ":" +
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0") +
    "." +
    String(cs).padStart(2, "0")
  );
}

/** Clean up temp files silently */
async function cleanupFiles(...paths: string[]): Promise<void> {
  for (const p of paths) {
    try {
      await fs.promises.unlink(p);
    } catch {
      // ignore — file may already be deleted
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Whisper transcription — get word-level timestamps from audio
// ---------------------------------------------------------------------------

interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

/**
 * Extract audio from video and transcribe with OpenAI Whisper API.
 * Returns word-level timestamps for speech alignment.
 */
async function transcribeWithWhisper(videoPath: string): Promise<WhisperWord[]> {
  // Extract audio to WAV (Whisper works best with WAV)
  const audioPath = path.join(os.tmpdir(), `whisper-audio-${Date.now()}.wav`);

  await execFile("ffmpeg", [
    "-i", videoPath,
    "-vn",           // no video
    "-acodec", "pcm_s16le",
    "-ar", "16000",  // 16kHz sample rate (optimal for Whisper)
    "-ac", "1",      // mono
    "-y",
    audioPath,
  ]);

  try {
    const openai = new OpenAI();
    const audioFile = await fs.promises.readFile(audioPath);
    const file = new File([audioFile], "audio.wav", { type: "audio/wav" });

    const response = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file,
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const words: WhisperWord[] = ((response as any).words ?? []).map(
      (w: { word: string; start: number; end: number }) => ({
        word: w.word.trim(),
        start: w.start,
        end: w.end,
      })
    );

    return words;
  } finally {
    await cleanupFiles(audioPath);
  }
}

// ---------------------------------------------------------------------------
// 2. mapScriptToWhisperTimings — use Whisper timing with our exact text
// ---------------------------------------------------------------------------

/**
 * Map our known script words onto Whisper's timestamps.
 * - If word counts match: 1:1 mapping (ideal case)
 * - If they differ: proportional mapping — each script word gets the
 *   timestamp of its proportional position in Whisper's timeline
 */
export function mapScriptToWhisperTimings(
  scriptWords: string[],
  whisperWords: WhisperWord[],
): TimedWord[] {
  if (whisperWords.length === 0 || scriptWords.length === 0) return [];

  const N = scriptWords.length;
  const M = whisperWords.length;

  const timedWords: TimedWord[] = [];

  for (let i = 0; i < N; i++) {
    // Map script word index to proportional Whisper word index
    const whisperIdx = Math.min(Math.round(i * (M - 1) / Math.max(N - 1, 1)), M - 1);

    // For end time, look at next word's start or use this word's end
    let endTime: number;
    if (i < N - 1) {
      const nextWhisperIdx = Math.min(
        Math.round((i + 1) * (M - 1) / Math.max(N - 1, 1)),
        M - 1
      );
      endTime = whisperWords[nextWhisperIdx].start;
    } else {
      endTime = whisperWords[whisperIdx].end;
    }

    timedWords.push({
      word: scriptWords[i],
      start: whisperWords[whisperIdx].start,
      end: endTime,
    });
  }

  return timedWords;
}

// ---------------------------------------------------------------------------
// 3. shotsToTimedWords — fallback: convert shot dialogues to timed words
// ---------------------------------------------------------------------------

/**
 * Fallback: evenly distribute words across each shot's duration.
 * Used when Whisper transcription fails.
 */
export function shotsToTimedWords(shots: ShotDialogue[]): TimedWord[] {
  const timedWords: TimedWord[] = [];
  let cumulativeTime = 0;

  for (const shot of shots) {
    const words = shot.dialogue.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      cumulativeTime += shot.durationSeconds;
      continue;
    }

    const buffer = 0.15;
    const usableDuration = Math.max(shot.durationSeconds - buffer * 2, 0.5);
    const wordDuration = usableDuration / words.length;

    for (let i = 0; i < words.length; i++) {
      timedWords.push({
        word: words[i],
        start: cumulativeTime + buffer + i * wordDuration,
        end: cumulativeTime + buffer + (i + 1) * wordDuration,
      });
    }

    cumulativeTime += shot.durationSeconds;
  }

  return timedWords;
}

// ---------------------------------------------------------------------------
// 4. wordsToBoldAss — clean bold white captions (TikTok/Reels style)
// ---------------------------------------------------------------------------

export function wordsToBoldAss(words: TimedWord[]): string {
  if (words.length === 0) return "";

  const header = `[Script Info]
Title: Captions
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,90,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,6,0,2,60,60,250,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const wordsPerLine = 3;
  const maxWordsPerBlock = wordsPerLine * 2;
  const dialogueLines: string[] = [];

  // 1. Split into sentences — a sentence ends when a word ends with . ? !
  const sentences: TimedWord[][] = [];
  let currentSentence: TimedWord[] = [];
  for (const w of words) {
    currentSentence.push(w);
    if (/[.!?]$/.test(w.word.trim())) {
      sentences.push(currentSentence);
      currentSentence = [];
    }
  }
  if (currentSentence.length > 0) sentences.push(currentSentence);

  // 2. Chunk each sentence into display blocks
  for (const sentence of sentences) {
    for (let i = 0; i < sentence.length; i += maxWordsPerBlock) {
      const chunk = sentence.slice(i, i + maxWordsPerBlock);
      const blockStart = chunk[0].start;
      const blockEnd = chunk[chunk.length - 1].end;

      const lines: string[] = [];
      for (let j = 0; j < chunk.length; j += wordsPerLine) {
        const lineWords = chunk.slice(j, j + wordsPerLine);
        lines.push(lineWords.map((w) => w.word).join(" "));
      }
      const text = lines.join("\\N");

      dialogueLines.push(
        `Dialogue: 0,${toAssTime(blockStart)},${toAssTime(blockEnd)},Default,,0,0,0,,${text}`
      );
    }
  }

  return header + dialogueLines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// 5. burnCaptions — FFmpeg burn subtitles into video
// ---------------------------------------------------------------------------

export async function burnCaptions(
  videoPath: string,
  subtitlePath: string,
): Promise<string> {
  const outputPath = path.join(
    os.tmpdir(),
    `captioned-${Date.now()}.mp4`
  );

  await execFile("ffmpeg", [
    "-i",
    videoPath,
    "-vf",
    `ass=${subtitlePath}`,
    "-c:a",
    "copy",
    "-y",
    outputPath,
  ]);

  return outputPath;
}

// ---------------------------------------------------------------------------
// 6. generateCaptionsFromScript — Whisper timing + script text
// ---------------------------------------------------------------------------

/**
 * Generate captions using Whisper for speech timing + our exact script text.
 * 1. Transcribe audio with Whisper to get word-level timestamps
 * 2. Map our script words onto those timestamps (proportional mapping)
 * 3. Generate ASS subtitles with our text at Whisper's timing
 * 4. Burn into video with FFmpeg
 *
 * Falls back to even distribution if Whisper fails.
 */
export async function generateCaptionsFromScript(
  videoUrl: string,
  shots: ShotDialogue[],
): Promise<{ captionedVideoUrl: string }> {
  const tmpVideoPath = path.join(os.tmpdir(), `caption-input-${Date.now()}.mp4`);
  const tempFiles: string[] = [tmpVideoPath];

  try {
    // 1. Download video
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
      throw new Error(`Failed to download video: ${videoRes.status}`);
    }
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    await fs.promises.writeFile(tmpVideoPath, videoBuffer);

    // 2. Collect all script words in order
    const allScriptWords: string[] = [];
    for (const shot of shots) {
      const words = shot.dialogue.trim().split(/\s+/).filter(Boolean);
      allScriptWords.push(...words);
    }

    if (allScriptWords.length === 0) {
      throw new Error("No dialogue found in shots");
    }

    // 3. Get Whisper word-level timestamps, fall back to even distribution
    let timedWords: TimedWord[];
    try {
      const whisperWords = await transcribeWithWhisper(tmpVideoPath);
      if (whisperWords.length > 0) {
        timedWords = mapScriptToWhisperTimings(allScriptWords, whisperWords);
        console.log(
          `[captions] Whisper: ${whisperWords.length} words detected, ` +
          `script: ${allScriptWords.length} words, mapped successfully`
        );
      } else {
        console.warn("[captions] Whisper returned no words, falling back to even distribution");
        timedWords = shotsToTimedWords(shots);
      }
    } catch (whisperErr) {
      console.warn("[captions] Whisper failed, falling back to even distribution:", whisperErr);
      timedWords = shotsToTimedWords(shots);
    }

    // 4. Generate ASS subtitle file
    const assContent = wordsToBoldAss(timedWords);
    const subtitlePath = path.join(os.tmpdir(), `captions-${Date.now()}.ass`);
    tempFiles.push(subtitlePath);
    await fs.promises.writeFile(subtitlePath, assContent, "utf-8");

    // 5. Burn captions into video
    const captionedVideoPath = await burnCaptions(tmpVideoPath, subtitlePath);
    tempFiles.push(captionedVideoPath);

    // 6. Upload to Supabase Storage
    const db = createServerSupabase();
    const timestamp = Date.now();

    const captionedVideoBuffer = await fs.promises.readFile(captionedVideoPath);
    const videoStoragePath = `captions/${timestamp}-captioned.mp4`;
    const { error: videoUploadError } = await db.storage
      .from(VIDEO_STORAGE_BUCKET)
      .upload(videoStoragePath, captionedVideoBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (videoUploadError) {
      throw new Error(`Captioned video upload failed: ${videoUploadError.message}`);
    }

    const { data: videoPublicUrl } = db.storage
      .from(VIDEO_STORAGE_BUCKET)
      .getPublicUrl(videoStoragePath);

    return {
      captionedVideoUrl: videoPublicUrl.publicUrl,
    };
  } finally {
    await cleanupFiles(...tempFiles);
  }
}
