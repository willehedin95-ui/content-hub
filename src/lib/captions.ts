import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createServerSupabase } from "@/lib/supabase";
import { VIDEO_STORAGE_BUCKET } from "@/lib/constants";

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GladiaWord {
  word: string;
  start: number; // seconds
  end: number; // seconds
  confidence: number;
}

export interface TranscriptionResult {
  text: string;
  words: GladiaWord[];
  language: string;
}

export type CaptionStyle = "highlight" | "clean";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format seconds to SRT timestamp (HH:MM:SS,mmm) */
function toSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return (
    String(h).padStart(2, "0") +
    ":" +
    String(m).padStart(2, "0") +
    ":" +
    String(s).padStart(2, "0") +
    "," +
    String(ms).padStart(3, "0")
  );
}

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
// 1. transcribeAudio — Gladia API v2
// ---------------------------------------------------------------------------

export async function transcribeAudio(
  audioBuffer: Buffer,
  language: string
): Promise<TranscriptionResult> {
  const apiKey = process.env.GLADIA_API_KEY;
  if (!apiKey) throw new Error("GLADIA_API_KEY not set");

  // Step 1: Upload audio file
  const formData = new FormData();
  // Copy into a plain ArrayBuffer so TypeScript is happy with BlobPart
  const ab = audioBuffer.buffer.slice(
    audioBuffer.byteOffset,
    audioBuffer.byteOffset + audioBuffer.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([ab], { type: "audio/wav" });
  formData.append("audio", blob, "audio.wav");

  const uploadRes = await fetch("https://api.gladia.io/v2/upload", {
    method: "POST",
    headers: { "x-gladia-key": apiKey },
    body: formData,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Gladia upload failed (${uploadRes.status}): ${text}`);
  }

  const uploadData = (await uploadRes.json()) as { audio_url: string };

  // Step 2: Initiate transcription
  const transcriptionRes = await fetch(
    "https://api.gladia.io/v2/transcription",
    {
      method: "POST",
      headers: {
        "x-gladia-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: uploadData.audio_url,
        language_config: {
          languages: [language], // ISO 639-1 codes: "sv", "no", "da"
          code_switching: false,
        },
        subtitles: true,
        subtitles_config: {
          formats: ["srt"],
        },
      }),
    }
  );

  if (!transcriptionRes.ok) {
    const text = await transcriptionRes.text();
    throw new Error(
      `Gladia transcription init failed (${transcriptionRes.status}): ${text}`
    );
  }

  const transcriptionData = (await transcriptionRes.json()) as {
    id: string;
    result_url: string;
  };

  // Step 3: Poll for results
  const resultUrl = transcriptionData.result_url;
  const maxAttempts = 120; // 6 minutes max (120 * 3s)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));

    const pollRes = await fetch(resultUrl, {
      headers: { "x-gladia-key": apiKey },
    });

    if (!pollRes.ok) {
      const text = await pollRes.text();
      throw new Error(
        `Gladia poll failed (${pollRes.status}): ${text}`
      );
    }

    const pollData = (await pollRes.json()) as {
      status: string;
      result?: {
        transcription: {
          full_transcript: string;
          languages: string[];
          utterances: Array<{
            words: Array<{
              word: string;
              start: number;
              end: number;
              confidence: number;
            }>;
          }>;
        };
      };
    };

    if (pollData.status === "done" && pollData.result) {
      const transcription = pollData.result.transcription;
      const allWords: GladiaWord[] = [];

      for (const utterance of transcription.utterances) {
        for (const w of utterance.words) {
          allWords.push({
            word: w.word,
            start: w.start,
            end: w.end,
            confidence: w.confidence,
          });
        }
      }

      return {
        text: transcription.full_transcript,
        words: allWords,
        language: transcription.languages[0] || language,
      };
    }

    if (pollData.status === "error") {
      throw new Error("Gladia transcription failed");
    }

    // status is "queued" or "processing" — keep polling
  }

  throw new Error("Gladia transcription timed out after 6 minutes");
}

// ---------------------------------------------------------------------------
// 2. wordsToSrt — convert words to SRT subtitle format
// ---------------------------------------------------------------------------

export function wordsToSrt(words: GladiaWord[]): string {
  if (words.length === 0) return "";

  const blocks: Array<{ start: number; end: number; text: string }> = [];
  const wordsPerBlock = 5; // target 4-6 words per block

  for (let i = 0; i < words.length; i += wordsPerBlock) {
    const chunk = words.slice(i, i + wordsPerBlock);
    blocks.push({
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
      text: chunk.map((w) => w.word).join(" "),
    });
  }

  return blocks
    .map(
      (block, idx) =>
        `${idx + 1}\n${toSrtTime(block.start)} --> ${toSrtTime(block.end)}\n${block.text}`
    )
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// 3. wordsToHighlightAss — ASS with per-word karaoke highlight
// ---------------------------------------------------------------------------

export function wordsToHighlightAss(words: GladiaWord[]): string {
  if (words.length === 0) return "";

  const header = `[Script Info]
Title: Caption Highlights
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,0,2,40,40,120,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const wordsPerBlock = 5;
  const dialogueLines: string[] = [];

  for (let i = 0; i < words.length; i += wordsPerBlock) {
    const chunk = words.slice(i, i + wordsPerBlock);
    const blockStart = chunk[0].start;
    const blockEnd = chunk[chunk.length - 1].end;

    // Build karaoke text: each word gets a \kf tag with duration in centiseconds
    // Active word is highlighted in yellow (&H0000FFFF)
    let karaokeText = "";
    for (const w of chunk) {
      const durationCs = Math.round((w.end - w.start) * 100);
      // \kf = karaoke fill effect: gradually fills from SecondaryColour to PrimaryColour
      // We override: before fill = white, during fill = yellow
      karaokeText += `{\\kf${durationCs}\\1c&H0000FFFF&}${w.word} `;
    }
    // Reset colour at start so unfilled words appear white
    karaokeText = `{\\1c&H00FFFFFF&}` + karaokeText.trim();

    dialogueLines.push(
      `Dialogue: 0,${toAssTime(blockStart)},${toAssTime(blockEnd)},Default,,0,0,0,,${karaokeText}`
    );
  }

  return header + dialogueLines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// 4. extractAudio — FFmpeg extract audio from video
// ---------------------------------------------------------------------------

export async function extractAudio(videoPath: string): Promise<string> {
  const outputPath = path.join(
    os.tmpdir(),
    `caption-audio-${Date.now()}.wav`
  );

  await execFile("ffmpeg", [
    "-i",
    videoPath,
    "-vn",
    "-acodec",
    "pcm_s16le",
    "-ar",
    "16000",
    "-ac",
    "1",
    "-y",
    outputPath,
  ]);

  return outputPath;
}

// ---------------------------------------------------------------------------
// 5. burnCaptions — FFmpeg burn subtitles into video
// ---------------------------------------------------------------------------

export async function burnCaptions(
  videoPath: string,
  subtitlePath: string,
  style: CaptionStyle
): Promise<string> {
  const outputPath = path.join(
    os.tmpdir(),
    `captioned-${Date.now()}.mp4`
  );

  let vfArg: string;
  if (style === "highlight") {
    // ASS format — use ass= filter
    vfArg = `ass=${subtitlePath}`;
  } else {
    // SRT format — use subtitles= filter with clean white style
    vfArg = `subtitles=${subtitlePath}:force_style='FontName=Arial,FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=3,Outline=2'`;
  }

  await execFile("ffmpeg", [
    "-i",
    videoPath,
    "-vf",
    vfArg,
    "-c:a",
    "copy",
    "-y",
    outputPath,
  ]);

  return outputPath;
}

// ---------------------------------------------------------------------------
// 6. generateCaptions — full orchestration
// ---------------------------------------------------------------------------

export async function generateCaptions(
  videoUrl: string,
  language: string,
  style: CaptionStyle
): Promise<{ srtUrl: string; captionedVideoUrl: string }> {
  const tmpVideoPath = path.join(os.tmpdir(), `caption-input-${Date.now()}.mp4`);
  const tempFiles: string[] = [tmpVideoPath];

  try {
    // 1. Download video from URL to temp file
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) {
      throw new Error(`Failed to download video: ${videoRes.status}`);
    }
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    await fs.promises.writeFile(tmpVideoPath, videoBuffer);

    // 2. Extract audio
    const audioPath = await extractAudio(tmpVideoPath);
    tempFiles.push(audioPath);

    // 3. Transcribe
    const audioBuffer = await fs.promises.readFile(audioPath);
    const transcription = await transcribeAudio(audioBuffer, language);

    if (transcription.words.length === 0) {
      throw new Error("Transcription returned no words");
    }

    // 4. Generate subtitle file
    let subtitleContent: string;
    let subtitleExt: string;
    if (style === "highlight") {
      subtitleContent = wordsToHighlightAss(transcription.words);
      subtitleExt = "ass";
    } else {
      subtitleContent = wordsToSrt(transcription.words);
      subtitleExt = "srt";
    }

    const subtitlePath = path.join(
      os.tmpdir(),
      `captions-${Date.now()}.${subtitleExt}`
    );
    tempFiles.push(subtitlePath);
    await fs.promises.writeFile(subtitlePath, subtitleContent, "utf-8");

    // 5. Burn captions into video
    const captionedVideoPath = await burnCaptions(
      tmpVideoPath,
      subtitlePath,
      style
    );
    tempFiles.push(captionedVideoPath);

    // 6. Upload to Supabase Storage
    const db = createServerSupabase();
    const timestamp = Date.now();

    // Upload SRT file (always upload SRT regardless of style, for reference)
    const srtContent = wordsToSrt(transcription.words);
    const srtStoragePath = `captions/${language}/${timestamp}.srt`;
    const { error: srtUploadError } = await db.storage
      .from(VIDEO_STORAGE_BUCKET)
      .upload(srtStoragePath, Buffer.from(srtContent, "utf-8"), {
        contentType: "text/plain",
        upsert: true,
      });

    if (srtUploadError) {
      throw new Error(`SRT upload failed: ${srtUploadError.message}`);
    }

    const { data: srtPublicUrl } = db.storage
      .from(VIDEO_STORAGE_BUCKET)
      .getPublicUrl(srtStoragePath);

    // Upload captioned video
    const captionedVideoBuffer = await fs.promises.readFile(captionedVideoPath);
    const videoStoragePath = `captions/${language}/${timestamp}-captioned.mp4`;
    const { error: videoUploadError } = await db.storage
      .from(VIDEO_STORAGE_BUCKET)
      .upload(videoStoragePath, captionedVideoBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (videoUploadError) {
      throw new Error(
        `Captioned video upload failed: ${videoUploadError.message}`
      );
    }

    const { data: videoPublicUrl } = db.storage
      .from(VIDEO_STORAGE_BUCKET)
      .getPublicUrl(videoStoragePath);

    return {
      srtUrl: srtPublicUrl.publicUrl,
      captionedVideoUrl: videoPublicUrl.publicUrl,
    };
  } finally {
    // 8. Clean up temp files
    await cleanupFiles(...tempFiles);
  }
}
