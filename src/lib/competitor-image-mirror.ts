import crypto from "crypto";
import type { createServerSupabase } from "@/lib/supabase-admin";
import { STORAGE_BUCKET } from "@/lib/constants";

/**
 * Mirror competitor ad images to Supabase Storage.
 *
 * GetHookd media URLs are signed with `expires=` and die exactly 24h after
 * they were issued. Anything that stores or later consumes those URLs breaks
 * once the signature lapses: the "Original Competitor Ad" thumbnail in the
 * concept UI goes blank, and the Anthropic API (which downloads url-type
 * image sources server-side) starts failing swipes with
 * "Unable to download the file".
 *
 * This helper downloads each image once and re-hosts it in the public
 * storage bucket under competitor-ads/, returning permanent URLs.
 */

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function isAlreadyMirrored(url: string): boolean {
  return url.includes(".supabase.co/storage/");
}

export interface MirrorResult {
  /** Same length/order as input. Mirrored URL where successful, original URL otherwise. */
  urls: string[];
  /** Original URLs that could not be downloaded. */
  failed: string[];
}

export async function mirrorCompetitorImages(
  db: ReturnType<typeof createServerSupabase>,
  sourceUrls: string[],
  folder: string,
): Promise<MirrorResult> {
  const failed: string[] = [];

  const urls = await Promise.all(
    sourceUrls.map(async (url) => {
      if (isAlreadyMirrored(url)) return url;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length === 0) throw new Error("Empty response body");

        const ext = EXT_BY_CONTENT_TYPE[contentType] ?? "jpg";
        const filePath = `competitor-ads/${folder}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await db.storage
          .from(STORAGE_BUCKET)
          .upload(filePath, buffer, { contentType, upsert: false });
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(filePath);
        return urlData.publicUrl;
      } catch (err) {
        console.warn(
          `[competitor-image-mirror] Failed to mirror ${url.slice(0, 120)}: ${err instanceof Error ? err.message : String(err)}`,
        );
        failed.push(url);
        return url;
      }
    }),
  );

  return { urls, failed };
}
