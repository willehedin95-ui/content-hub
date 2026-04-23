// Route handler for /quizzes/[id]/preview
// Returns a full HTML document with the quiz runtime so the editor's
// Preview tab can embed it in a sandboxed iframe.
// Uses the same generateQuizShell as publish but injects preview:true
// into __QUIZ_CONFIG__ so the runtime skips sessions/events/Klaviyo.

import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { getRuntimeBundle, generateQuizShell } from "@/lib/quiz-publish-shell";
import { NextResponse } from "next/server";
import type { QuizRow } from "@/types/quiz";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let workspaceId: string;
  try {
    workspaceId = await getWorkspaceId();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const db = createServerSupabase();
  const { data, error } = await db
    .from("quizzes")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !data) {
    return new NextResponse("Quiz not found", { status: 404 });
  }

  const quiz = data as QuizRow;

  let html: string;
  try {
    const { hash } = getRuntimeBundle();
    const baseHtml = generateQuizShell(quiz, hash, "");

    // Patch __QUIZ_CONFIG__ to include preview:true and clear apiBaseUrl
    html = baseHtml.replace(
      /window\.__QUIZ_CONFIG__\s*=\s*(\{[^;]+\});/,
      (_match, configJson: string) => {
        try {
          const config = JSON.parse(configJson) as Record<string, unknown>;
          config.preview = true;
          config.apiBaseUrl = ""; // relative - events go to same origin (and are no-ops)
          return `window.__QUIZ_CONFIG__ = ${JSON.stringify(config)};`;
        } catch {
          return _match;
        }
      },
    );
  } catch {
    html = `<!doctype html><html><head><title>Preview not available</title>
<meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;color:#555;line-height:1.5">
  <h2 style="margin-top:0">Runtime bundle not built</h2>
  <p>Run the following command then reload:</p>
  <pre style="background:#f5f5f5;padding:1rem;border-radius:6px;overflow-x:auto">cd runtime/quiz-runtime &amp;&amp; npm run build</pre>
</body></html>`;
  }

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
