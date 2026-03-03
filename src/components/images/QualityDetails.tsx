"use client";

import { useState } from "react";
import { Version } from "@/types";

export default function QualityDetails({ version }: { version: Version }) {
  const [expanded, setExpanded] = useState(false);
  const score = version.quality_score ?? 0;
  const analysis = version.quality_analysis;

  const badgeClasses = score >= 80
    ? "bg-emerald-50 text-emerald-700"
    : score >= 60
    ? "bg-yellow-50 text-yellow-700"
    : "bg-red-50 text-red-700";

  return (
    <div className="px-5 pt-2 shrink-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${badgeClasses} hover:opacity-80 transition-opacity`}
      >
        Quality: {Math.round(score)}/100
        <span className="text-xs ml-0.5">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && analysis && (
        <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
          {analysis.overall_assessment && (
            <p className="text-gray-700">{analysis.overall_assessment}</p>
          )}
        </div>
      )}
    </div>
  );
}
