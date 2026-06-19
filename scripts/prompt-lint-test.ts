// Usage: npx tsx scripts/prompt-lint-test.ts   (pure, no API)
import { lintImagePrompt, summarizeLint } from "../src/lib/prompt-lint";

let failed = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failed++;
}

// Hydro13 visual rules
check("amber bottle blocks", !lintImagePrompt("A close-up of an amber bottle on a sink", { productSlug: "hydro13" }).pass);
check("shot glass blocks", !lintImagePrompt("woman holding a shot glass of golden liquid", { productSlug: "hydro13" }).pass);
check("glass bottle blocks", !lintImagePrompt("a clear glass bottle of collagen", { productSlug: "hydro13" }).pass);
check("large drinking glass blocks", !lintImagePrompt("a tall drinking glass next to the bottle", { productSlug: "hydro13" }).pass);
check(
  "correct white bottle passes",
  lintImagePrompt("a tall sleek white plastic bottle with white screw cap, label HYDRO13, tiny 30ml espresso glass with golden liquid", {
    productSlug: "hydro13",
  }).pass,
);
check("ice theme warns but passes", lintImagePrompt("bottle surrounded by ice cubes", { productSlug: "hydro13" }).pass);

// HappySleep
check("bare foam blocks", !lintImagePrompt("a bare foam pillow on a bed", { productSlug: "happysleep" }).pass);

// Rendered-text language rule (Swedish market)
const sv = lintImagePrompt(JSON.stringify({ scene: "kvinna i kök", overlay_text: "COLLAGEN BOOST" }), {
  productSlug: "hydro13",
  language: "Swedish",
});
check("english rendered text blocks in SV market", !sv.pass);
check(
  "swedish rendered text passes",
  lintImagePrompt(JSON.stringify({ overlay_text: "Fastare hy på 14 dagar" }), { productSlug: "hydro13", language: "Swedish" }).pass,
);
check(
  "english text fine in EN market",
  lintImagePrompt(JSON.stringify({ overlay_text: "COLLAGEN" }), { language: "English" }).pass,
);

// Hyphen rule (warn, not block)
const dash = lintImagePrompt("text says 'Resultat - på 14 dagar' — verkligen", { language: "Swedish" });
check("em-dash warns", dash.violations.some((v) => v.rule === "hyphen"));

// quoted-string detection (non-JSON prompt)
check(
  "quoted english in SV prompt blocks",
  !lintImagePrompt(`photo with sign reading "BEFORE" held up`, { language: "Swedish" }).pass,
);

console.log("\nexample summary:", summarizeLint(lintImagePrompt("amber bottle, shot glass", { productSlug: "hydro13" })));
console.log(failed ? `\n${failed} test(s) FAILED` : "\nAll lint tests passed ✓");
process.exit(failed ? 1 : 0);
