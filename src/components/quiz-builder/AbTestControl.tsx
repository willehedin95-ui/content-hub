"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { GitBranch, BarChart3, Loader2 } from "lucide-react";
import { useQuiz } from "./QuizContext";
import { AbTestResults } from "./AbTestResults";

type Status =
  | { role: "none" }
  | {
      role: "a" | "b";
      ownerId: string;
      ownerName: string;
      variantId: string;
      variantName: string;
      splitA: number;
    };

/** Topbar A/B control: turn a quiz into a whole-quiz A/B test, switch between
 *  editing Variant A and Variant B, and open the results scoreboard. */
export function AbTestControl() {
  const { quiz } = useQuiz();
  const [status, setStatus] = useState<Status | null>(null);
  const [creating, setCreating] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/quiz/${quiz.id}/ab-test`);
      if (res.ok) setStatus((await res.json()) as Status);
    } catch {
      /* leave as null - control just won't render */
    }
  }, [quiz.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/quiz/${quiz.id}/ab-test`, { method: "POST" });
      if (res.ok) await load();
    } finally {
      setCreating(false);
    }
  };

  if (!status) return null;

  // Not a test yet -> offer to create one.
  if (status.role === "none") {
    return (
      <button
        type="button"
        onClick={handleCreate}
        disabled={creating}
        title="Duplicate this quiz into a Variant B and split traffic 50/50 on one URL"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-60"
      >
        {creating ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
        A/B-test
      </button>
    );
  }

  const ownerUrl = `/quizzes/${status.ownerId}/edit`;
  const variantUrl = `/quizzes/${status.variantId}/edit`;

  return (
    <>
      <div className="flex items-center gap-1.5">
        <div className="flex items-center rounded-md border border-indigo-300 bg-indigo-50 overflow-hidden text-sm font-medium">
          <span className="px-2 py-1.5 text-[11px] font-semibold tracking-wider text-indigo-400 uppercase">
            A/B
          </span>
          <VariantSeg label="A" active={status.role === "a"} href={ownerUrl} title="Variant A (control)" />
          <VariantSeg label="B" active={status.role === "b"} href={variantUrl} title="Variant B" />
        </div>
        <button
          type="button"
          onClick={() => setShowResults(true)}
          title="A/B test results"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <BarChart3 size={14} />
          Resultat
        </button>
      </div>

      {showResults && (
        <AbTestResults
          quizId={quiz.id}
          onClose={() => setShowResults(false)}
          onEnded={() => {
            setShowResults(false);
            void load();
          }}
        />
      )}
    </>
  );
}

function VariantSeg({
  label,
  active,
  href,
  title,
}: {
  label: string;
  active: boolean;
  href: string;
  title: string;
}) {
  if (active) {
    return (
      <span
        className="px-3 py-1.5 bg-indigo-600 text-white"
        title={`${title} - you're editing this`}
      >
        {label}
      </span>
    );
  }
  return (
    <Link href={href} className="px-3 py-1.5 text-indigo-700 hover:bg-indigo-100 transition-colors" title={`Edit ${title}`}>
      {label}
    </Link>
  );
}
