import { createServerSupabase } from "@/lib/supabase-admin";
import { getWorkspaceId } from "@/lib/workspace";
import { notFound } from "next/navigation";
import type { QuizRow } from "@/types/quiz";
import { AnalyticsClient } from "./AnalyticsClient";

export const dynamic = "force-dynamic";

export default async function QuizAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workspaceId = await getWorkspaceId();
  const db = createServerSupabase();

  const { data, error } = await db
    .from("quizzes")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !data) notFound();

  return <AnalyticsClient quiz={data as QuizRow} />;
}
