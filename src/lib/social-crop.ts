import sharp from "sharp";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STORAGE_BUCKET } from "@/lib/constants";

// Feed images are kept at 4:5 or wider (Instagram's portrait limit, William
// 2026-10-05). Taller images are cropped to 4:5; the original is kept so the
// crop can be redone by hand.
export const MAX_PORTRAIT = 4 / 5;

async function store(db: SupabaseClient, ws: string, jpeg: Buffer): Promise<string> {
  const path = `social/${ws}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.jpg`;
  const { error } = await db.storage.from(STORAGE_BUCKET).upload(path, jpeg, { contentType: "image/jpeg" });
  if (error) throw new Error(`upload: ${error.message}`);
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

/** Store an image; if taller than 4:5, also store a 4:5 crop (where the subject is, or centred). */
export async function storeFeedImage(db: SupabaseClient, ws: string, input: Buffer, smart = true): Promise<{ url: string; original: string }> {
  const base = sharp(input).rotate();
  const jpegOriginal = await base.clone().resize({ width: 1440, withoutEnlargement: true }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  const original = await store(db, ws, jpegOriginal);
  const { width = 0, height = 0 } = await sharp(jpegOriginal).metadata();
  if (!width || !height || width / height >= MAX_PORTRAIT - 0.002) return { url: original, original };
  const h = Math.round(width / MAX_PORTRAIT);
  // Two separate pipelines: sharp applies only the LAST resize in a chain, so
  // crop + downscale in one chain silently skipped the crop.
  const crop = await sharp(jpegOriginal).resize({ width, height: h, fit: "cover", position: smart ? sharp.strategy.attention : "centre" }).toBuffer();
  const cropped = await sharp(crop).resize({ width: 1080, withoutEnlargement: true }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  return { url: await store(db, ws, cropped), original };
}

/** Crop a stored original by fractions (0-1) of its size, to exactly 4:5 or wider. */
export async function cropFromOriginal(db: SupabaseClient, ws: string, originalUrl: string, box: { x: number; y: number; w: number; h: number }): Promise<string> {
  const res = await fetch(originalUrl, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const { width = 0, height = 0 } = await sharp(buf).metadata();
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const left = Math.round(clamp(box.x) * width), top = Math.round(clamp(box.y) * height);
  const w = Math.min(width - left, Math.round(clamp(box.w) * width)), h = Math.min(height - top, Math.round(clamp(box.h) * height));
  const jpeg = await sharp(buf).extract({ left, top, width: w, height: h }).resize({ width: 1080, withoutEnlargement: true }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  return store(db, ws, jpeg);
}
