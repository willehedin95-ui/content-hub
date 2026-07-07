import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Coerce a JSONB-sourced value into a clean string[].
 *
 * Columns like `ad_copy_primary` / `ad_copy_headline` are jsonb, so a bad
 * write can land a bare string (or object) where an array is expected. A
 * plain `?? []` guard only catches null/undefined, so `"text".some(...)`
 * still throws "some is not a function" and takes down the whole page.
 * This normalizes: array -> strings only, lone non-empty string -> [string],
 * anything else -> [].
 */
export function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}
