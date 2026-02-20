import { NextResponse } from "next/server";

/**
 * Log the full error server-side and return a safe generic message to the client.
 * Prevents leaking database schema details or internal error messages.
 */
export function safeError(
  error: unknown,
  publicMessage: string,
  status = 500
) {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? (error as { message: string }).message
        : String(error);
  console.error(`[API Error] ${publicMessage}:`, detail);
  return NextResponse.json({ error: publicMessage }, { status });
}
