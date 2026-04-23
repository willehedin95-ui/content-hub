import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspace } from "@/lib/workspace";
import { QuizzesClient } from "./page.client";
import type { QuizRow } from "@/types/quiz";

export const dynamic = "force-dynamic";

export default async function QuizzesPage() {
  const workspace = await getWorkspace();
  const db = createServerSupabase();

  const { data, error } = await db
    .from("quizzes")
    .select("*")
    .eq("workspace_id", workspace.id)
    .neq("status", "archived")
    .order("updated_at", { ascending: false });

  if (error) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          Failed to load quizzes: {error.message}
        </p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <QuizzesClient
        initialRows={(data as QuizRow[]) ?? []}
        workspaceId={workspace.id}
      />
    </div>
  );
}
