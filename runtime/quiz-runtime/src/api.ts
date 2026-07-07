// API calls from runtime to the Next.js hub

import type { QuizEvent, UTMParams } from "./types";

export async function startSession(
  apiBaseUrl: string,
  quizId: string,
  variantAssignments: Record<string, string>,
  utm: UTMParams,
  market: string,
): Promise<string> {
  const res = await fetch(`${apiBaseUrl}/api/quiz/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quizId,
      variant_assignments: variantAssignments,
      utm,
      ua: navigator.userAgent,
      market,
    }),
  });
  if (!res.ok) throw new Error(`session start failed: ${res.status}`);
  const json = (await res.json()) as { session_id: string };
  return json.session_id;
}

/**
 * startSession with retry + backoff (3 retries: 1s / 3s / 9s). A single
 * failed cold-start request used to cost the ENTIRE session's events and
 * left the exit redirect without qz_sid (purchases misattributed to
 * "Direct LP"). Events buffer client-side while this retries.
 */
export async function startSessionWithRetry(
  apiBaseUrl: string,
  quizId: string,
  variantAssignments: Record<string, string>,
  utm: UTMParams,
  market: string,
): Promise<string> {
  const delaysMs = [1000, 3000, 9000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      return await startSession(apiBaseUrl, quizId, variantAssignments, utm, market);
    } catch (err) {
      lastErr = err;
      if (attempt < delaysMs.length) {
        await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
      }
    }
  }
  throw lastErr;
}

export async function flushEvents(
  apiBaseUrl: string,
  sessionId: string,
  events: QuizEvent[],
): Promise<void> {
  const payload = {
    session_id: sessionId,
    events: events.map((e) => ({
      event_type: e.event_type,
      step_id: e.step_id,
      variant_group_id: e.variant_group_id,
      option_id: e.option_id,
      meta: e.meta,
    })),
  };
  const res = await fetch(`${apiBaseUrl}/api/quiz/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  });
  if (!res.ok) throw new Error(`events flush failed: ${res.status}`);
}

export async function subscribeKlaviyo(
  apiBaseUrl: string,
  sessionId: string,
  email: string,
  listId: string,
): Promise<void> {
  const res = await fetch(`${apiBaseUrl}/api/quiz/klaviyo-subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, email, listId }),
  });
  if (!res.ok) throw new Error(`klaviyo subscribe failed: ${res.status}`);
}
