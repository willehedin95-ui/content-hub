export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string): boolean {
  return UUID_RE.test(value);
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
