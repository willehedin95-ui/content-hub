import sharp from "sharp";
import { randomUUID } from "crypto";
import { createServerSupabase } from "@/lib/supabase-admin";
import { STORAGE_BUCKET } from "@/lib/constants";

// Kie's result host is erratic: the same ~2 MB file took 1 s one time and
// 93 s the next (measured 2026-09-30), and the browser then paints it row by
// row. Copy the result into our own storage as a small JPEG right after
// generation, so the wait happens during "Generating..." and the image the
// user sees (and saves) loads from our CDN. Falls back to the Kie URL on any
// failure - a slow image beats no image.
const FETCH_TIMEOUT_MS = 280_000;

// GPT Image 2.5 and Grok have no 4:5, so kie.ts asks them for the nearest
// ratio (3:4 / 2:3). Crop the result to the ratio that was picked, so "4:5"
// always comes back as 4:5 whatever the model.
async function cropToRatio(input: Buffer, ratio: string): Promise<Buffer> {
  const [rw, rh] = ratio.split(":").map(Number);
  const { width = 0, height = 0 } = await sharp(input).metadata();
  if (!rw || !rh || !width || !height) return input;
  const target = rw / rh;
  if (Math.abs(width / height - target) / target < 0.01) return input;
  const w = width / height > target ? Math.round(height * target) : width;
  const h = width / height > target ? height : Math.round(width / target);
  return sharp(input).resize({ width: w, height: h, fit: "cover", position: sharp.strategy.attention }).toBuffer();
}

export async function persistSwipeImage(kieUrl: string, ratio?: string): Promise<string> {
  try {
    const res = await fetch(kieUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const rotated = await sharp(Buffer.from(await res.arrayBuffer())).rotate().toBuffer();
    const input = ratio ? await cropToRatio(rotated, ratio) : rotated;
    const jpeg = await sharp(input).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
    const path = `swipe-results/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.jpg`;
    const db = createServerSupabase();
    const { error } = await db.storage.from(STORAGE_BUCKET).upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error(error.message);
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
    return `${base}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
  } catch (err) {
    console.error("[swipe-image-store] falling back to Kie URL:", err instanceof Error ? err.message : err);
    return kieUrl;
  }
}
