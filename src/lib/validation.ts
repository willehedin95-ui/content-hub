import { Language, LANGUAGES, AspectRatio, ASPECT_RATIOS } from "@/types";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string): boolean {
  return UUID_RE.test(value);
}

const VALID_LANGUAGES = new Set(LANGUAGES.map((l) => l.value));
const VALID_RATIOS = new Set(ASPECT_RATIOS.map((r) => r.value));

export function isValidLanguage(lang: string): lang is Language {
  return VALID_LANGUAGES.has(lang as Language);
}

export function isValidAspectRatio(ratio: string): ratio is AspectRatio {
  return VALID_RATIOS.has(ratio as AspectRatio);
}

export function isValidBudget(budget: number): boolean {
  return Number.isFinite(budget) && budget > 0;
}

export const ALLOWED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
export const MAX_IMAGE_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export function validateImageFile(
  file: File
): { valid: true; ext: string } | { valid: false; error: string; status: number } {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) {
    return { valid: false, error: "Invalid file type. Allowed: png, jpg, jpeg, gif, webp", status: 400 };
  }
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    return { valid: false, error: "File too large (max 50 MB)", status: 413 };
  }
  return { valid: true, ext };
}

const BLOCKED_HOSTNAMES = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./, // link-local
  /^\[::1\]$/, // IPv6 loopback
  /^\[fd/i, // IPv6 private
  /^\[fe80:/i, // IPv6 link-local
];

export function isAllowedUrl(
  url: string
): { valid: true; parsed: URL } | { valid: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: "Invalid URL" };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return {
      valid: false,
      reason: "Only http and https URLs are allowed",
    };
  }

  if (BLOCKED_HOSTNAMES.some((p) => p.test(parsed.hostname))) {
    return {
      valid: false,
      reason: "URLs pointing to internal/private addresses are not allowed",
    };
  }

  return { valid: true, parsed };
}
