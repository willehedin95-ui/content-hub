import { describe, it, expect } from "vitest";
import {
  isValidUUID,
  isValidLanguage,
  isValidAspectRatio,
  isValidBudget,
  validateImageFile,
  isAllowedUrl,
  ALLOWED_IMAGE_EXTENSIONS,
  MAX_IMAGE_FILE_SIZE,
} from "./validation";

describe("isValidUUID", () => {
  it("accepts valid v4 UUIDs", () => {
    expect(isValidUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isValidUUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(true);
  });

  it("rejects invalid UUIDs", () => {
    expect(isValidUUID("")).toBe(false);
    expect(isValidUUID("not-a-uuid")).toBe(false);
    expect(isValidUUID("550e8400-e29b-41d4-a716")).toBe(false);
    expect(isValidUUID("550e8400e29b41d4a716446655440000")).toBe(false);
  });
});

describe("isValidLanguage", () => {
  it("accepts supported languages", () => {
    expect(isValidLanguage("sv")).toBe(true);
    expect(isValidLanguage("da")).toBe(true);
    expect(isValidLanguage("no")).toBe(true);
    expect(isValidLanguage("de")).toBe(true);
  });

  it("rejects unsupported languages", () => {
    expect(isValidLanguage("en")).toBe(false);
    expect(isValidLanguage("")).toBe(false);
    expect(isValidLanguage("fr")).toBe(false);
    expect(isValidLanguage("NO")).toBe(false); // case-sensitive
  });
});

describe("isValidAspectRatio", () => {
  it("accepts supported ratios", () => {
    expect(isValidAspectRatio("1:1")).toBe(true);
    expect(isValidAspectRatio("9:16")).toBe(true);
  });

  it("rejects unsupported ratios", () => {
    expect(isValidAspectRatio("16:9")).toBe(false);
    expect(isValidAspectRatio("4:5")).toBe(false);
    expect(isValidAspectRatio("")).toBe(false);
    expect(isValidAspectRatio("2:3")).toBe(false);
  });
});

describe("isValidBudget", () => {
  it("accepts positive finite numbers", () => {
    expect(isValidBudget(100)).toBe(true);
    expect(isValidBudget(0.01)).toBe(true);
    expect(isValidBudget(999999)).toBe(true);
  });

  it("rejects zero, negative, and non-finite values", () => {
    expect(isValidBudget(0)).toBe(false);
    expect(isValidBudget(-10)).toBe(false);
    expect(isValidBudget(Infinity)).toBe(false);
    expect(isValidBudget(NaN)).toBe(false);
  });
});

describe("validateImageFile", () => {
  function makeFile(name: string, size: number): File {
    return new File([new ArrayBuffer(size)], name, { type: "image/png" });
  }

  it("accepts valid image files", () => {
    for (const ext of ALLOWED_IMAGE_EXTENSIONS) {
      const result = validateImageFile(makeFile(`test.${ext}`, 1024));
      expect(result).toEqual({ valid: true, ext });
    }
  });

  it("rejects disallowed extensions", () => {
    const result = validateImageFile(makeFile("exploit.svg", 1024));
    expect(result).toEqual({
      valid: false,
      error: "Invalid file type. Allowed: png, jpg, jpeg, gif, webp",
      status: 400,
    });
  });

  it("rejects files over 50 MB", () => {
    const result = validateImageFile(
      makeFile("huge.png", MAX_IMAGE_FILE_SIZE + 1)
    );
    expect(result).toEqual({
      valid: false,
      error: "File too large (max 50 MB)",
      status: 413,
    });
  });

  it("accepts files exactly at the limit", () => {
    const result = validateImageFile(
      makeFile("exact.png", MAX_IMAGE_FILE_SIZE)
    );
    expect(result).toEqual({ valid: true, ext: "png" });
  });
});

describe("isAllowedUrl", () => {
  it("accepts valid public URLs", () => {
    const r1 = isAllowedUrl("https://example.com/image.png");
    expect(r1.valid).toBe(true);

    const r2 = isAllowedUrl("http://cdn.example.com/path?q=1");
    expect(r2.valid).toBe(true);
  });

  it("rejects non-http protocols", () => {
    const result = isAllowedUrl("ftp://example.com/file");
    expect(result).toEqual({
      valid: false,
      reason: "Only http and https URLs are allowed",
    });
  });

  it("rejects malformed URLs", () => {
    const result = isAllowedUrl("not a url");
    expect(result).toEqual({ valid: false, reason: "Invalid URL" });
  });

  it("rejects localhost and private IPs", () => {
    const blocked = [
      "http://localhost/path",
      "http://127.0.0.1/path",
      "http://10.0.0.1/path",
      "http://172.16.0.1/path",
      "http://192.168.1.1/path",
      "http://169.254.1.1/path",
      "http://0.0.0.0/path",
    ];
    for (const url of blocked) {
      const result = isAllowedUrl(url);
      expect(result.valid, `Expected ${url} to be blocked`).toBe(false);
    }
  });
});
