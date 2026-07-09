// Shared helpers for whole-quiz A/B tests.
// An experiment = Variant A (the owner/published quiz, holds ab_variant_quiz_id)
// + Variant B (the linked quiz). All visitor sessions run under A's URL/quiz_id
// and carry the flipped variant in variant_assignments["ab_<variantId>"].

import type { createServerSupabase } from "@/lib/supabase-admin";

type DB = ReturnType<typeof createServerSupabase>;

export type AbExperiment = {
  /** Role of the quiz that was asked about. */
  role: "a" | "b";
  /** Variant A quiz - the owner, the one that gets published. */
  ownerId: string;
  ownerName: string;
  /** Variant B quiz - the linked, editable variant. */
  variantId: string;
  variantName: string;
  /** Percent of visitors shown Variant A. */
  splitA: number;
};

/** The session variant_assignments key that carries the flipped variant. */
export function abAssignmentKey(variantId: string): string {
  return `ab_${variantId}`;
}

/** Resolve the experiment any quiz belongs to (as owner A or variant B), or
 *  null if the quiz isn't part of an A/B test. Workspace-scoped. */
export async function resolveExperiment(
  db: DB,
  workspaceId: string,
  quizId: string,
): Promise<AbExperiment | null> {
  const { data: self } = await db
    .from("quizzes")
    .select("id, name, ab_variant_quiz_id, ab_split_a")
    .eq("id", quizId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!self) return null;

  // This quiz owns an experiment -> it's Variant A.
  const variantId = (self as { ab_variant_quiz_id?: string | null }).ab_variant_quiz_id;
  if (variantId) {
    const { data: b } = await db
      .from("quizzes")
      .select("name")
      .eq("id", variantId)
      .maybeSingle();
    return {
      role: "a",
      ownerId: self.id as string,
      ownerName: self.name as string,
      variantId,
      variantName: (b?.name as string) ?? "Variant B",
      splitA: ((self as { ab_split_a?: number | null }).ab_split_a ?? 50) as number,
    };
  }

  // Some quiz points at this one -> this is Variant B.
  const { data: owner } = await db
    .from("quizzes")
    .select("id, name, ab_split_a")
    .eq("ab_variant_quiz_id", quizId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (owner) {
    return {
      role: "b",
      ownerId: owner.id as string,
      ownerName: owner.name as string,
      variantId: quizId,
      variantName: self.name as string,
      splitA: ((owner as { ab_split_a?: number | null }).ab_split_a ?? 50) as number,
    };
  }

  return null;
}
