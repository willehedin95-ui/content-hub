/**
 * Shared product appearance descriptions for AI image generation.
 *
 * Used by both static-ad-prompt.ts (brainstorm pipeline) and
 * swipe-competitor.ts (competitor swipe pipeline) to ensure Kie AI
 * renders products with the correct physical appearance.
 */

interface ProductLike {
  slug: string;
  name: string;
  description?: string | null;
  ingredients?: string | null;
}

export function getProductAppearance(product: ProductLike): string {
  if (product.slug === "happysleep") {
    return `The product is: ${product.name}. Physical appearance: ${product.ingredients}. IMPORTANT: The pillow must have a white quilted diamond-pattern fabric cover with a distinctive black mesh breathable ventilation strip along the bottom/side edge. It is a contoured cervical pillow with dual height (higher on one side). Do NOT show bare foam — always show the finished pillow with its fabric cover on.`;
  }

  if (product.slug === "hydro13") {
    return `The product is: Envana Collagen Formula — a premium liquid marine collagen supplement. IMPORTANT PHYSICAL APPEARANCE: The bottle is a WHITE 500 ml plastic bottle (not amber, not glass, not transparent) with a white ribbed screw cap and a soft peach label: the coral wordmark "Envana" runs vertically along the left edge, "collagen formula" in dark brown, a small coral pill "FÖR HUD, HÅR & NAGLAR", a peach flower motif, "Kosttillskott med marint kollagen" and "12500mg | 500ml". Copy the label from the product reference image. If a drinking glass is shown, it must be a tiny 30 ml clear glass (like an espresso cup, about one-fifth the height of the bottle) with golden honey-colored liquid. NEVER show a regular drinking glass or shot glass.`;
  }

  if (product.description || product.ingredients) {
    return `The product is: ${product.name}. ${product.description || ""} Key specs: ${product.ingredients || ""}. Show the actual product accurately — refer to the product reference image for the exact appearance.`;
  }

  return "";
}

/**
 * Product-specific rule for the swipe tool, applied ONLY when the swiped photo
 * already shows the product being drunk or poured. Worded conditionally so
 * the model never adds a drink to a photo that has none (2026-09-30: a
 * magnesium-drink photo came back with milky water in the glasses).
 */
export function getSwipeProductNote(product: ProductLike): string {
  if (product.slug === "hydro13") {
    return " PRODUCT LIQUID: Only if the scene includes a drink being drunk, poured or held in a glass, render that liquid as this product really looks. Undiluted - in a small shot glass, or pouring straight from the bottle - it is a clear DARK GOLDEN liquid, like dark honey. Mixed into a drink in any larger glass it is diluted: a PALE, light straw-yellow, softly translucent liquid. Never pink, white, brown or fizzy. If the scene has no drink, do NOT add a glass or a drink.";
  }
  return "";
}

export type SwipeForm = "bottle" | "shot" | "glass";

/**
 * How each serving form of the product is described to the image model in
 * Swipe Image. The user picks the forms (bottle, shot glass, regular glass);
 * swapCompetitorProduct places them in the competitor's scene.
 */
/** What fills a glass the competitor already shows, when "Glas" is picked. */
export function getSwipeGlassContents(product: ProductLike): string {
  return product.slug === "hydro13"
    ? "a diluted drink: a pale, light straw-yellow, softly translucent liquid"
    : `a drink made with ${product.name}`;
}

export function getSwipeFormDescriptions(product: ProductLike, hasProductRef: boolean): Record<SwipeForm, (count?: number) => string> {
  const bottle = (count = 1) => {
    const one = hasProductRef
      ? `the ${product.name} product, identical to the product reference image including its label and printed text`
      : `${product.name} — ${product.description || "premium wellness product"}`;
    return count > 1 ? `${count} identical units of ${one}` : one;
  };
  if (product.slug === "hydro13") {
    return {
      bottle,
      shot: () => "a tiny 30 ml clear shot glass (espresso-cup size, about one-fifth the height of the product bottle) filled with a clear dark golden liquid like dark honey - an undiluted shot of the collagen",
      glass: () => "a clear drinking glass with the collagen mixed into a drink: a pale, light straw-yellow, softly translucent liquid",
    };
  }
  return {
    bottle,
    shot: () => `a small clear shot glass with a serving of ${product.name}`,
    glass: () => `a regular clear drinking glass with ${product.name} mixed into water`,
  };
}
