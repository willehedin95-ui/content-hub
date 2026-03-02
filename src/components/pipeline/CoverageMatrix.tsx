"use client";

import { useState, useEffect } from "react";
import type {
  AutoCoverageMatrixCell,
  AutoCoverageGap,
  Product,
} from "@/types";

interface CoverageMatrixProps {
  onGapClick?: (gap: AutoCoverageGap) => void;
}

export default function CoverageMatrix({ onGapClick }: CoverageMatrixProps) {
  const [matrix, setMatrix] = useState<AutoCoverageMatrixCell[]>([]);
  const [gaps, setGaps] = useState<AutoCoverageGap[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCoverage();
    const interval = setInterval(fetchCoverage, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  async function fetchCoverage() {
    try {
      const res = await fetch("/api/pipeline/coverage");
      if (!res.ok) throw new Error("Failed to fetch coverage");
      const data = await res.json();
      setMatrix(data.matrix);
      setGaps(data.gaps);
    } catch (error) {
      console.error("Error fetching coverage:", error);
    } finally {
      setLoading(false);
    }
  }

  const products: Product[] = ["happysleep", "hydro13"];
  const markets = ["SE", "DK", "NO"];
  const awarenessLevels = ["unaware", "problem_aware", "solution_aware"];

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-4">Coverage Matrix</h2>
        <div className="text-sm text-gray-500">Loading coverage data...</div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Coverage Matrix</h2>
        <button
          onClick={fetchCoverage}
          className="text-xs text-indigo-600 hover:text-indigo-700"
        >
          Refresh
        </button>
      </div>

      {/* Matrix Grid */}
      <div className="mb-6 space-y-6">
        {products.map((product) => (
          <div key={product}>
            <h3 className="text-sm font-medium text-gray-700 capitalize mb-2">
              {product}
            </h3>
            <div className="grid grid-cols-4 gap-2 mb-2">
              <div className="text-xs font-medium text-gray-500"></div>
              {markets.map((market) => (
                <div
                  key={market}
                  className="text-xs font-medium text-gray-700 uppercase text-center"
                >
                  {market}
                </div>
              ))}
            </div>
            {awarenessLevels.map((level) => (
              <div key={level} className="grid grid-cols-4 gap-2 mb-2">
                <div className="text-xs font-medium text-gray-700 capitalize">
                  {level.replace("_", " ")}
                </div>
                {markets.map((market) => {
                  const cell = matrix.find(
                    (c) =>
                      c.product === product &&
                      c.market === market &&
                      c.awareness_level === level
                  );
                  const count = cell?.concept_count || 0;
                  const hasGap = gaps.some(
                    (g) =>
                      g.product === product &&
                      g.market === market &&
                      g.awareness_level === level
                  );

                  return (
                    <div
                      key={`${product}-${market}-${level}`}
                      className={`
                        text-center text-sm font-medium py-2 rounded border
                        ${
                          count === 0
                            ? "bg-red-50 text-red-700 border-red-200"
                            : count < 3
                              ? "bg-yellow-50 text-yellow-700 border-yellow-200"
                              : "bg-green-50 text-green-700 border-green-200"
                        }
                        ${hasGap && onGapClick ? "cursor-pointer hover:ring-2 hover:ring-offset-2 hover:ring-indigo-500" : ""}
                      `}
                      onClick={() => {
                        if (hasGap && onGapClick) {
                          const gap = gaps.find(
                            (g) =>
                              g.product === product &&
                              g.market === market &&
                              g.awareness_level === level
                          );
                          if (gap) onGapClick(gap);
                        }
                      }}
                      title={
                        count === 0
                          ? "No concepts"
                          : count < 3
                            ? "Low coverage"
                            : "Good coverage"
                      }
                    >
                      {count}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Coverage Gaps */}
      {gaps.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Coverage Gaps
          </h3>
          <div className="space-y-2">
            {gaps.slice(0, 5).map((gap, i) => (
              <div
                key={i}
                className={`
                  text-xs p-2 rounded border bg-gray-50 border-gray-200
                  ${onGapClick ? "cursor-pointer hover:bg-gray-100" : ""}
                `}
                onClick={() => onGapClick?.(gap)}
              >
                <span className="font-medium capitalize">{gap.product}</span>
                <span className="mx-1">•</span>
                <span className="uppercase">{gap.market}</span>
                <span className="mx-1">•</span>
                <span className="capitalize">
                  {gap.awareness_level.replace("_", " ")}
                </span>
                <span className="mx-1">•</span>
                <span
                  className={`font-medium ${
                    gap.priority === "high"
                      ? "text-red-600"
                      : gap.priority === "medium"
                        ? "text-yellow-600"
                        : "text-gray-600"
                  }`}
                >
                  {gap.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
