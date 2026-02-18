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
        <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs space-y-2">
          {analysis.overall_assessment && (
            <p className="text-gray-700">{analysis.overall_assessment}</p>
          )}
          {analysis.spelling_errors?.length > 0 && (
            <div>
              <span className="text-red-600 font-medium">Spelling errors: </span>
              <span className="text-gray-600">{analysis.spelling_errors.join(", ")}</span>
            </div>
          )}
          {analysis.grammar_issues?.length > 0 && (
            <div>
              <span className="text-yellow-600 font-medium">Grammar issues: </span>
              <span className="text-gray-600">{analysis.grammar_issues.join(", ")}</span>
            </div>
          )}
          {analysis.missing_text?.length > 0 && (
            <div>
              <span className="text-orange-600 font-medium">Missing text: </span>
              <span className="text-gray-600">{analysis.missing_text.join(", ")}</span>
            </div>
          )}
          {analysis.extracted_text && (
            <div>
              <span className="text-gray-500 font-medium">Extracted text: </span>
              <span className="text-gray-600">{analysis.extracted_text}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
