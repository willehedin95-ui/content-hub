"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FlaskConical,
  Trophy,
} from "lucide-react";
import { ABTest, ABTestStatus, LANGUAGES } from "@/types";

interface ABTestWithPage extends ABTest {
  pages: { id: string; name: string; slug: string };
}

interface Props {
  tests: ABTestWithPage[];
  languages: typeof LANGUAGES;
}

const STATUS_CONFIG: Record<ABTestStatus, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "text-gray-600", bg: "bg-gray-100" },
  active: { label: "Active", color: "text-emerald-700", bg: "bg-emerald-50" },
  completed: { label: "Completed", color: "text-indigo-700", bg: "bg-indigo-50" },
};

export default function ABTestsClient({ tests, languages }: Props) {
  const [filter, setFilter] = useState<"all" | ABTestStatus>("all");

  const filtered = filter === "all" ? tests : tests.filter(t => t.status === filter);

  const counts = {
    all: tests.length,
    active: tests.filter(t => t.status === "active").length,
    draft: tests.filter(t => t.status === "draft").length,
    completed: tests.filter(t => t.status === "completed").length,
  };

  const getLang = (code: string) => languages.find(l => l.value === code);

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">A/B Tests</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {counts.active} active {counts.active === 1 ? "test" : "tests"}
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4 bg-gray-100 rounded-lg p-0.5 w-fit">
        {(["all", "active", "draft", "completed"] as const).map(key => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filter === key
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {key === "all" ? "All" : STATUS_CONFIG[key].label}
            {counts[key] > 0 && (
              <span className="ml-1.5 text-gray-400">{counts[key]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tests list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl">
          <FlaskConical className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">
            {filter === "all"
              ? "No A/B tests yet. Create one from a landing page."
              : `No ${filter} tests.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(test => {
            const lang = getLang(test.language);
            const status = STATUS_CONFIG[test.status];
            const hasWinner = test.winner !== null;

            return (
              <Link
                key={test.id}
                href={`/pages/${test.page_id}/ab-test/${test.language}`}
                className="flex items-center gap-4 px-4 py-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all group"
              >
                {/* Status indicator */}
                <div className={`w-2 h-2 rounded-full shrink-0 ${
                  test.status === "active" ? "bg-emerald-500 animate-pulse" :
                  test.status === "completed" ? "bg-indigo-500" : "bg-gray-300"
                }`} />

                {/* Page info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {test.pages.name}
                    </span>
                    {lang && (
                      <span className="text-xs text-gray-400">{lang.flag}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${status.bg} ${status.color}`}>
                      {status.label}
                    </span>
                    <span className="text-xs text-gray-400">
                      {test.split}% / {100 - test.split}% split
                    </span>
                    {hasWinner && (
                      <span className="flex items-center gap-0.5 text-xs text-amber-600">
                        <Trophy className="w-3 h-3" />
                        Winner: {test.winner === "control" ? "Control (A)" : "Variant B"}
                      </span>
                    )}
                  </div>
                </div>

                {/* URL */}
                {test.router_url && (
                  <span className="text-xs text-gray-400 truncate max-w-[200px] hidden lg:block">
                    {test.router_url.replace("https://", "")}
                  </span>
                )}

                {/* Action hint */}
                <span className="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  Manage →
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
