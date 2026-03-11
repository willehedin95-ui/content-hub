"use client";

import { useState } from "react";
import { Version } from "@/types";
import { deriveImageGrade, gradeConfig } from "@/lib/quality-grades";

export default function QualityDetails({ version }: { version: Version }) {
  const [expanded, setExpanded] = useState(false);
  const analysis = version.quality_analysis;
  if (!analysis) return null;

  const grade = deriveImageGrade(analysis);
  const gc = gradeConfig(grade);

  return (
    <div className="px-5 pt-2 shrink-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${gc.bg} ${gc.color} hover:opacity-80 transition-opacity`}
      >
        {gc.label}
        <span className="text-xs ml-0.5">{expanded ? "\u25B2" : "\u25BC"}</span>
      </button>

      {expanded && analysis.overall_assessment && (
        <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs">
          <p className="text-gray-700">{analysis.overall_assessment}</p>
        </div>
      )}
    </div>
  );
}
