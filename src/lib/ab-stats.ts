/**
 * Two-proportion Z-test for A/B test statistical significance.
 */
export function calculateSignificance(
  controlViews: number,
  controlClicks: number,
  variantViews: number,
  variantClicks: number
) {
  const n1 = controlViews;
  const n2 = variantViews;
  const p1 = n1 > 0 ? controlClicks / n1 : 0;
  const p2 = n2 > 0 ? variantClicks / n2 : 0;

  // Minimum sample size for 80% power, 5% significance, detecting 20% relative lift
  const baseRate = (p1 + p2) / 2 || 0.05;
  const effectSize = baseRate * 0.2;
  const minSampleSize = Math.ceil(
    (2 * baseRate * (1 - baseRate) * Math.pow(1.96 + 0.84, 2)) /
    Math.pow(effectSize, 2)
  );

  const hasEnoughData = n1 >= 30 && n2 >= 30;

  if (n1 === 0 || n2 === 0) {
    return {
      pValue: 1, significant: false, confidenceLevel: 0,
      winner: "none" as const, minSampleSize, hasEnoughData: false,
    };
  }

  const pPool = (controlClicks + variantClicks) / (n1 + n2);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));

  if (se === 0) {
    return {
      pValue: 1, significant: false, confidenceLevel: 0,
      winner: "none" as const, minSampleSize, hasEnoughData,
    };
  }

  const zScore = (p2 - p1) / se;
  const pValue = 2 * (1 - normalCDF(Math.abs(zScore)));
  const significant = pValue < 0.05;
  const confidenceLevel = Math.round((1 - pValue) * 1000) / 10;
  const winner: "control" | "variant" | "none" = !significant ? "none" : p2 > p1 ? "variant" : "control";

  return { pValue, significant, confidenceLevel, winner, minSampleSize, hasEnoughData };
}

/** Standard normal CDF approximation (Abramowitz & Stegun) */
function normalCDF(x: number): number {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * ax);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1.0 + sign * y);
}
