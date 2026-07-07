import { NextRequest, NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createServerSupabase } from "@/lib/supabase-admin";
import { safeError } from "@/lib/api-error";
import { getWorkspaceId } from "@/lib/workspace";
import { ALLOWED_VIDEO_EXTENSIONS } from "@/lib/validation";
import type { AssetCategory, MediaType } from "@/types";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB
const MAX_REDIRECTS = 5;

const ALLOWED_CONTENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

// --- SSRF guard: block private/reserved IP ranges and localhost ---

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8 (loopback)
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 (CGNAT)
    (a === 169 && b === 254) || // 169.254.0.0/16 (link-local, cloud metadata)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    a >= 224 // multicast + reserved
  );
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) return isPrivateIPv4(ip);
  const lower = ip.toLowerCase();
  // IPv4-mapped IPv6 (::ffff:10.0.0.1)
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return (
    lower === "::1" || // loopback
    lower === "::" ||
    lower.startsWith("fc") || // fc00::/7 (unique local)
    lower.startsWith("fd") ||
    lower.startsWith("fe8") || // fe80::/10 (link-local)
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  );
}

/** Throws if the hostname is localhost or resolves to any private/reserved IP. */
async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("URL host is not allowed");
  }
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new Error("URL host is not allowed");
    return;
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new Error("Could not resolve URL host");
  }
  if (addresses.length === 0) throw new Error("Could not resolve URL host");
  for (const { address } of addresses) {
    if (isPrivateIp(address)) throw new Error("URL host is not allowed");
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { url, name, category, product } = body as {
    url?: string;
    name?: string;
    category?: AssetCategory;
    product?: string;
  };

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required" }, { status: 400 });
  }

  // Validate URL format
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Invalid protocol");
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Fetch the file. Redirects are followed manually so every hop gets the
  // SSRF host check - "redirect: follow" would happily land on an internal
  // host after the first public hop.
  let response: Response | null = null;
  try {
    let currentUrl = parsedUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHost(currentUrl.hostname);
      const res = await fetch(currentUrl, {
        headers: { "User-Agent": "ContentHub/1.0" },
        redirect: "manual",
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) {
          return NextResponse.json({ error: "Redirect without location" }, { status: 400 });
        }
        currentUrl = new URL(location, currentUrl);
        if (!["http:", "https:"].includes(currentUrl.protocol)) {
          return NextResponse.json({ error: "Invalid redirect target" }, { status: 400 });
        }
        continue;
      }
      response = res;
      break;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Fetch failed";
    return NextResponse.json({ error: `Failed to fetch URL: ${msg}` }, { status: 400 });
  }

  if (!response) {
    return NextResponse.json({ error: "Too many redirects" }, { status: 400 });
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: `URL returned ${response.status}` },
      { status: 400 }
    );
  }

  // Validate content type. A valid image/video content-type is REQUIRED -
  // the old URL-extension fallback let any response through by naming the
  // path "x.jpg", which combined with the public bucket made this an open
  // file-hosting proxy.
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "";
  const ext = ALLOWED_CONTENT_TYPES[contentType];

  if (!ext) {
    return NextResponse.json(
      { error: `Unsupported content type: ${contentType || "unknown"}` },
      { status: 400 }
    );
  }

  const isVideo = ALLOWED_VIDEO_EXTENSIONS.has(ext);
  const mediaType: MediaType = isVideo ? "video" : "image";

  // Reject early on declared size, then stream with a hard cap instead of
  // buffering an unbounded response before checking.
  const declaredLength = parseInt(response.headers.get("content-length") ?? "0", 10);
  if (declaredLength > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large (max 200 MB)" }, { status: 413 });
  }

  if (!response.body) {
    return NextResponse.json({ error: "Empty response body" }, { status: 400 });
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_FILE_SIZE) {
        await reader.cancel();
        return NextResponse.json({ error: "File too large (max 200 MB)" }, { status: 413 });
      }
      chunks.push(value);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: `Failed to download file: ${msg}` }, { status: 400 });
  }

  const buffer = Buffer.concat(chunks);

  // Derive filename
  const assetName = name?.trim() || parsedUrl.pathname.split("/").pop()?.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ") || "imported-asset";
  const assetCategory: AssetCategory = category || "other";

  // Upload to Supabase Storage
  const db = createServerSupabase();
  const storagePath = `assets/${mediaType}/${assetCategory}/${Date.now()}-imported.${ext}`;

  const { error: uploadError } = await db.storage
    .from("translated-images")
    .upload(storagePath, buffer, {
      contentType: contentType || `${mediaType}/${ext}`,
      upsert: false,
    });

  if (uploadError) return safeError(uploadError, "Failed to store file");

  const { data: { publicUrl } } = db.storage.from("translated-images").getPublicUrl(storagePath);

  // Create asset record
  const workspaceId = await getWorkspaceId();
  const { data, error } = await db
    .from("assets")
    .insert({
      name: assetName,
      category: assetCategory,
      media_type: mediaType,
      product: product || null,
      tags: [],
      url: publicUrl,
      file_size: buffer.length,
      source_url: url,
      workspace_id: workspaceId,
    })
    .select()
    .single();

  if (error) return safeError(error, "Failed to save asset");
  return NextResponse.json(data, { status: 201 });
}
