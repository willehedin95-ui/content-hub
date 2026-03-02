import type { AutoPipelineConcept, AutoCoverageMatrixCell, AutoCoverageGap, Product } from "@/types";

const AWARENESS_LEVELS = ["unaware", "problem_aware", "solution_aware", "product_aware", "most_aware"];

/**
 * Calculate coverage matrix from existing concepts
 */
export function calculateCoverageMatrix(
  concepts: AutoPipelineConcept[],
  product: Product,
  markets: string[]
): AutoCoverageMatrixCell[] {
  const cells: AutoCoverageMatrixCell[] = [];

  for (const market of markets) {
    for (const awarenessLevel of AWARENESS_LEVELS) {
      const conceptsInCell = concepts.filter(
        (c) =>
          c.product === product &&
          c.target_markets?.includes(market) &&
          c.cash_dna?.awareness_level === awarenessLevel
      );

      const liveAds = conceptsInCell.filter((c) => c.status === "live");

      const lastTested = conceptsInCell.length > 0
        ? [...conceptsInCell].sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )[0].created_at
        : null;

      cells.push({
        product,
        market,
        awareness_level: awarenessLevel,
        concept_count: conceptsInCell.length,
        live_ad_count: liveAds.length,
        last_tested_at: lastTested,
        performance_summary: null, // TODO: Calculate from Meta data
      });
    }
  }

  return cells;
}

/**
 * Identify coverage gaps and generate suggestions
 */
export function identifyCoverageGaps(
  cells: AutoCoverageMatrixCell[]
): AutoCoverageGap[] {
  const gaps: AutoCoverageGap[] = [];

  // High priority: Empty cells (never tested)
  const emptyCells = cells.filter((c) => c.concept_count === 0);
  for (const cell of emptyCells) {
    gaps.push({
      priority: "high",
      message: `Missing: ${formatAwarenessLevel(cell.awareness_level)} concepts for ${cell.market} market`,
      product: cell.product,
      market: cell.market,
      awareness_level: cell.awareness_level,
    });
  }

  // Medium priority: Low coverage (1 concept only)
  const lowCoverage = cells.filter((c) => c.concept_count === 1);
  for (const cell of lowCoverage) {
    gaps.push({
      priority: "medium",
      message: `Low coverage: Only 1 ${formatAwarenessLevel(cell.awareness_level)} concept for ${cell.market}`,
      product: cell.product,
      market: cell.market,
      awareness_level: cell.awareness_level,
    });
  }

  return gaps.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

/**
 * Generate actionable suggestions from gaps
 */
export function generateSuggestions(gaps: AutoCoverageGap[]): string[] {
  return gaps.slice(0, 3).map((gap) => {
    if (gap.priority === "high") {
      return `Test ${formatAwarenessLevel(gap.awareness_level)} + curiosity hook for ${gap.market} market`;
    }
    return `Create more ${formatAwarenessLevel(gap.awareness_level)} concepts for ${gap.market}`;
  });
}

function formatAwarenessLevel(level: string): string {
  return level
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
