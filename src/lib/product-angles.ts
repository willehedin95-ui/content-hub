/**
 * Per-product advertising angle configs for the Page Swiper.
 *
 * Each product defines:
 * - angles: the selectable angles with labels for the Claude prompt
 * - brandName: how to reference the brand in swiped copy
 * - guarantee: the guarantee to use in swiped copy
 */

export interface AngleOption {
  value: string;
  label: string;
  /** Full description passed to Claude in the prompt */
  description: string;
}

export interface ProductAngleConfig {
  angles: AngleOption[];
  brandName: string;
  guarantee: string;
}

const HAPPYSLEEP_ANGLES: ProductAngleConfig = {
  brandName: "SwedishBalance",
  guarantee: "100-night money-back guarantee",
  angles: [
    {
      value: "neck-pain",
      label: "Neck Pain",
      description:
        "Neck Pain — morning stiffness, chronic pain, failed treatments, waking up worse than when you went to bed",
    },
    {
      value: "snoring",
      label: "Snoring",
      description:
        "Snoring — relationship destruction, partner rage, kinked airway, separate bedrooms, exhaustion",
    },
    {
      value: "sleep-quality",
      label: "Sleep Quality",
      description:
        "Sleep Quality — poor rest, fatigue, tossing and turning, never feeling refreshed",
    },
    {
      value: "general",
      label: "General / Listicle (multi-benefit)",
      description:
        'General / Listicle — not focused on one problem; broad product benefits ("X reasons why", multiple selling points, catch-all). Cover comfort, materials, sleep science, quality, value, guarantee, social proof. The page should work for any audience segment.',
    },
  ],
};

const HYDRO13_ANGLES: ProductAngleConfig = {
  brandName: "SwedishBalance",
  guarantee: "60-day results guarantee (better skin in 60 days, or your money back)",
  angles: [
    {
      value: "general",
      label: "General (skin, aging, beauty)",
      description:
        'General — covers the full range of Hydro13 benefits with skin and aging as the primary focus. 12,500 mg marine collagen (2.5-6x more than competitors), liquid format for superior absorption, 1,500 Dalton molecular weight, 13+ active ingredients, 60-day results guarantee. Primary benefits: radiant skin, reduced fine lines, restored glow and elasticity, collagen replenishment. Secondary benefits: stronger hair, healthier nails, replaces entire supplement cabinet. Frame as a health investment, not anti-aging (Scandinavian cultural sensitivity). Evidence-based confidence, not hypey.',
    },
  ],
};

/** Fallback config for products without specific angle definitions */
const DEFAULT_ANGLES: ProductAngleConfig = {
  brandName: "SwedishBalance",
  guarantee: "money-back guarantee",
  angles: [
    {
      value: "general",
      label: "General / Listicle (multi-benefit)",
      description:
        "General / Listicle — broad range of product benefits, multiple selling points. The page should work for any audience segment.",
    },
  ],
};

const PRODUCT_ANGLE_MAP: Record<string, ProductAngleConfig> = {
  happysleep: HAPPYSLEEP_ANGLES,
  hydro13: HYDRO13_ANGLES,
};

/**
 * Get the angle config for a product by slug.
 * Falls back to a generic config if the product has no specific angles defined.
 */
export function getProductAngles(productSlug: string): ProductAngleConfig {
  return PRODUCT_ANGLE_MAP[productSlug] ?? DEFAULT_ANGLES;
}

/**
 * Get the full angle description for a given product and angle value.
 * Returns the auto-detect description if the angle isn't found.
 */
export function getAngleDescription(productSlug: string, angleValue: string): string {
  if (angleValue === "auto-detect") {
    return "Auto-detect — match the angle to whatever problem the swiped source addresses";
  }
  const config = getProductAngles(productSlug);
  const angle = config.angles.find((a) => a.value === angleValue);
  return angle?.description ?? `${angleValue} — use the angle specified`;
}
