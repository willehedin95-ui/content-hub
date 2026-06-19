/**
 * CASH coverage map (Phase 4 of the Genesis integration).
 *
 * Overlays existing concepts on an angle x awareness grid and surfaces the empty/thin cells -
 * the "blue ocean" gaps that should aim the next generation batch. Pure function over the
 * cash_dna fields we already store on image_jobs. Feed the suggested gaps straight into
 * generateConceptsWithGenesis({ angle, awarenessLevel }).
 */

import type { Angle, AwarenessLevel } from "@/types";
import { ANGLES, AWARENESS_LEVELS } from "@/types";

export interface ConceptDimension {
  angle: Angle;
  awareness: AwarenessLevel;
}

export interface CoverageCell {
  angle: Angle;
  awareness: AwarenessLevel;
  count: number;
}

export interface CoverageMap {
  /** counts[awareness][angle] = number of concepts. */
  counts: Record<string, Record<string, number>>;
  total: number;
  /** Cells with zero concepts. */
  gaps: CoverageCell[];
  /** Non-zero cells below the mean (under-explored). */
  thin: CoverageCell[];
}

// Highest-leverage awareness levels first (where new angles open the most market).
const AWARENESS_PRIORITY: AwarenessLevel[] = ["Problem Aware", "Solution Aware", "Unaware", "Product Aware", "Most Aware"];

function computeCoverage(concepts: ConceptDimension[]): CoverageMap {
  const counts: Record<string, Record<string, number>> = {};
  for (const aw of AWARENESS_LEVELS) {
    counts[aw] = {};
    for (const an of ANGLES) counts[aw][an] = 0;
  }
  let total = 0;
  for (const c of concepts) {
    if (counts[c.awareness] && counts[c.awareness][c.angle] != null) {
      counts[c.awareness][c.angle]++;
      total++;
    }
  }

  const cells: CoverageCell[] = [];
  for (const aw of AWARENESS_LEVELS) for (const an of ANGLES) cells.push({ awareness: aw, angle: an, count: counts[aw][an] });

  const nonZero = cells.filter((c) => c.count > 0);
  const mean = nonZero.length ? nonZero.reduce((s, c) => s + c.count, 0) / nonZero.length : 0;

  const gaps = cells.filter((c) => c.count === 0);
  const thin = nonZero.filter((c) => c.count < mean).sort((a, b) => a.count - b.count);

  return { counts, total, gaps, thin };
}

/**
 * Rank the most valuable gaps to generate next. Prioritizes high-leverage awareness levels and
 * a spread of angles (don't return five gaps all in the same awareness row). Returns up to `n`.
 */
export function suggestGaps(concepts: ConceptDimension[], n = 5): CoverageCell[] {
  const { gaps } = computeCoverage(concepts);
  const byPriority = [...gaps].sort((a, b) => {
    const pa = AWARENESS_PRIORITY.indexOf(a.awareness);
    const pb = AWARENESS_PRIORITY.indexOf(b.awareness);
    return pa - pb;
  });

  // Spread across awareness rows: round-robin pick so we don't cluster.
  const picked: CoverageCell[] = [];
  const seenAwareness = new Set<string>();
  for (const cell of byPriority) {
    if (picked.length >= n) break;
    if (!seenAwareness.has(cell.awareness)) {
      picked.push(cell);
      seenAwareness.add(cell.awareness);
    }
  }
  // Fill remaining slots with the next-priority gaps.
  for (const cell of byPriority) {
    if (picked.length >= n) break;
    if (!picked.includes(cell)) picked.push(cell);
  }
  return picked;
}
