// Referenstest (engangs, 2026-08-13): hur troget aterger nano-banana-2 den FAKTISKA
// fastigheten Onsjo 415A nar den far ett riktigt maklarfoto som referensbild?
// Svarar pa den blockerande fragan om referenceStrategy: "product" for onsjo-workspacet.
// Run: npx --yes -p dotenv-cli@7 dotenv -e .env.local -- npx --yes tsx scripts/onsjo-reftest.ts

import { generateImage } from "../src/lib/kie";

const HERO = "https://stefanhedin.se/onsjo-415/underlag/img/full/02.jpg";

const PROMPTS: Array<{ label: string; prompt: string }> = [
  {
    label: "troget",
    prompt:
      "A photograph of this exact property at dusk. Keep the buildings, the wooden facades, the courtyard, the string lights and the landscaping EXACTLY as in the reference image - do not redesign, do not add or remove buildings. Editorial real-estate photography, natural light, no text.",
  },
  {
    label: "annonslikt",
    prompt:
      "Warm editorial lifestyle photograph at this property at dusk: the courtyard between two wooden buildings, string lights on, a long table set for dinner with people seated, glasses on the table. Documentary style, natural light, shallow depth of field, no text, no logos.",
  },
];

async function main() {
  for (const p of PROMPTS) {
    console.log(`\n=== ${p.label} ===`);
    try {
      const t0 = Date.now();
      const { urls } = await generateImage(p.prompt, [HERO], "4:5", "2K");
      console.log(`  ${Math.round((Date.now() - t0) / 1000)}s`);
      urls.forEach((u) => console.log(`  ${u}`));
    } catch (e) {
      console.log(`  FAIL: ${(e as Error).message}`);
    }
  }
}

main().then(() => process.exit(0));
