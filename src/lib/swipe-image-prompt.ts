// Swipe Image: extraction prompt and product swap. Shared by the route and
// scripts/_swipe-model-retest.ts so a test runs the exact production chain.
import type { ProductFull } from "@/types";
import { getSwipeFormDescriptions, getSwipeGlassContents, getSwipeProductNote, type SwipeForm } from "@/lib/product-appearance";

/**
 * Swap the competitor's product in Claude's extraction for the forms of our
 * product the user picked (bottle, shot glass, regular glass - default bottle).
 *
 * Claude marks two slots: the competitor's PACKAGE and its SERVING (a glass,
 * bowl or scoop). The bottle takes the package slot; a shot/glass takes the
 * serving slot, or the package slot when the bottle is not wanted. Forms with
 * no slot are placed next to the product. The competitor's package is always
 * replaced, never left in the picture. A serving with no form picked stays as
 * it is (a plain glass, a bowl), with the product's liquid colour applied by
 * the instruction.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function swapCompetitorProduct(extraction: Record<string, any>, product: ProductFull | null, hasProductRef: boolean, forms: SwipeForm[] = []) {
  const json = structuredClone(extraction);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subjects: Record<string, any>[] = Array.isArray(json.subjects) ? json.subjects : [];
  // Every unit of the competitor's package is swapped. Claude sometimes lists
  // a second bottle as its own subject; leaving it unmarked kept the
  // competitor's dropper bottle in the picture (2026-10-01, UpCircle).
  const pkgs = subjects.filter((s) => s.is_competitor_product);
  const pkg = pkgs[0];
  // Every glass/cup with the competitor's drink gets the picked form - a
  // couple each holding a glass must both get one (2026-10-01: only the
  // woman's glass became a shot, the man kept his).
  const servings = subjects.filter((s) => s.is_competitor_serving && !pkgs.includes(s));
  // A person must never be replaced. Claude sometimes puts the serving flag
  // on the people holding the glasses (2026-10-01: both people were rewritten
  // as "a tiny shot glass" and the model invented a new couple). For a person
  // only the glass in their hand changes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const swapServing = (sv: Record<string, any>, text: string) => {
    if (sv.type === "person") {
      sv.description = `${sv.description}. The glass in their hand is now ${text}.`;
      if (sv.action) sv.action = `${sv.action} (the glass is now ${text})`;
    } else {
      become(sv, text);
    }
  };
  const serving = servings[0];
  for (const s of subjects) {
    delete s.is_competitor_product;
    delete s.is_competitor_serving;
  }
  if (!product) {
    if (pkg) pkg.description = "Generic wellness product, neutral/white color";
    return json;
  }

  const picked: SwipeForm[] = forms.length > 0 ? forms : ["bottle"];
  const desc = getSwipeFormDescriptions(product, hasProductRef);
  const wantBottle = picked.includes("bottle");
  const queue = picked.filter((f) => f !== "bottle");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const become = (s: Record<string, any>, text: string) => {
    s.type = "product";
    s.description = text;
    delete s.count;
  };

  if (pkg) {
    const first = wantBottle ? null : queue.shift()!;
    for (const p of pkgs) {
      if (wantBottle) become(p, desc.bottle(Number(p.count) || 1));
      else become(p, desc[first!]());
    }
  }
  if (serving && queue.length > 0) {
    const f = queue.shift()!;
    for (const sv of servings) {
      if (f === "glass" && sv.type === "person") {
        swapServing(sv, `the same glass, holding ${getSwipeGlassContents(product)} instead of the original drink`);
      } else if (f === "glass") {
        // Keep the competitor's own vessel (a wine glass stays a wine glass with
        // its stem) - only the contents change. Rewriting it as "a drinking
        // glass" threw the original glass away (2026-10-01).
        sv.type = "product";
        sv.description = `${sv.description}. KEEP THIS EXACT VESSEL - same shape, stem, size, position and grip. Only its contents change: it now holds ${getSwipeGlassContents(product)} instead of the original drink.`;
        delete sv.count;
      } else {
        swapServing(sv, desc[f]());
      }
    }
  }
  for (const f of queue) {
    subjects.push({ type: "product", description: desc[f](), position: "next to the other product, on the same surface or held naturally", action: "standing still" });
  }
  if (wantBottle && !pkg) {
    subjects.push({ type: "product", description: desc.bottle(), position: "standing on a nearby surface (counter or table), clearly visible", action: "standing still, not held by anyone" });
  }
  json.subjects = subjects;
  return json;
}

export type SwipeMode = "standard" | "ugc" | "replica";

/**
 * Build the image-model prompt from Claude's extraction. Replica gets a short
 * instruction; Standard/UGC get the extraction JSON with our product swapped
 * in and an instruction appended.
 */
export function buildSwipePrompt(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraction: Record<string, any>;
  product: ProductFull | null;
  hasProductRef: boolean;
  forms: SwipeForm[];
  mode: SwipeMode;
  notes?: string;
}): string {
  const { extraction, product, hasProductRef, forms, mode, notes } = opts;
  // No choice = bottle, same as before the toggles existed.
  const showsBottle = forms.length === 0 || forms.includes("bottle");
  // Build Nano Banana JSON prompt: swap competitor product with target product
  const isUgc = mode === "ugc";
  // With a real product photo as reference the label must be KEPT. The old
  // "no text / no labels / unbranded" rules made the model paint a blank
  // bottle (seen 2026-09-30 on the Envana bottle). They only make sense
  // when there is no product image to copy the label from.
  // The label rule only applies when the bottle is in the picture. With
  // only a shot/glass picked, the reference photo is there for colours
  // and the model must not paint the bottle into the scene.
  const labelNote = !showsBottle
    ? ` Do NOT show any bottle, can, jar or package in this image - the product appears only as the drink described in the subjects.`
    : hasProductRef
    ? ` CRITICAL: The product must look exactly like the product reference image, including its label, logo, colours and printed text. Copy the label from the reference; do not invent new text and do not leave the product blank.`
    : "";
  // Standard/UGC build the image from Claude's JSON description plus OUR
  // product photo only. Sending the original photo too (tried 2026-09-30)
  // made the model copy it near pixel-for-pixel - that is Replica's job.
  const compositionNote = product ? getSwipeProductNote(product) : "";
  const nanaBananaJson = swapCompetitorProduct(extraction, product, hasProductRef, forms);
  nanaBananaJson.task = "generate_image";

  const isReplica = mode === "replica";
  const ethnicityNote = " CRITICAL: Any people in the generated image MUST exactly match the ethnicity, skin tone, hair color, hair texture, and approximate age described in the subjects. Do NOT change the person's appearance.";

  let instruction: string;

  if (isReplica) {
    // Replica mode — send original as reference + simple swap instruction
    // Extract demographic from Claude's subjects analysis
    const personSubjects = (extraction.subjects || []).filter(
      (s: Record<string, unknown>) => s.type === "person"
    );
    const demographic = personSubjects.length > 0
      ? personSubjects[0].description?.split(",").slice(0, 2).join(",").trim() || "woman"
      : "person";

    instruction = `Replace the person with a different ${demographic}`;
  } else if (isUgc) {
    // UGC mode — strong authenticity instructions
    const ugcBlock = ` CRITICAL UGC AUTHENTICITY RULES: This MUST look like a real photo captured on an iPhone 16 Pro with the typical computational look of a real smartphone photo. Preserve raw handheld realism and the color science of an actual iPhone image. Any people must have fully realistic skin texture: visible pores on cheeks and nose, faint natural redness, slight forehead shine, soft under-eye detail — absolutely NO cosmetic smoothing or skin retouching. Do NOT upgrade to studio quality — match the casual, imperfect feel of the original exactly. Keep the same imperfect composition, slightly off-center framing, and natural ambient lighting. No filters, no retouching, no artificial blur, no professional studio lighting. The result must be indistinguishable from a real customer's phone photo.${hasProductRef ? "" : " CRITICAL: Do NOT generate, invent, or write ANY text on the product - no labels, no descriptions, no ingredient lists."}`;

    instruction = product
      ? `Recreate this exact visual style as a UGC customer photo featuring ${product.name}.${showsBottle ? " The product must match the reference images provided." : ""}${compositionNote}${labelNote}${ethnicityNote}${ugcBlock}`
      : `Recreate this exact visual style as a UGC customer photo.${ethnicityNote}${ugcBlock}`;
  } else {
    // Standard mode — original behavior
    const qualityNote = extraction.style?.photo_quality
      ? ` CRITICAL: Match the original photo quality exactly — ${extraction.style.photo_quality}. If the original is grainy, low-res, or looks like a phone photo, the result MUST have the same imperfections. Do NOT upgrade to studio quality.`
      : "";
    const textureNote = extraction.style?.texture && extraction.style.texture !== "sharp" && extraction.style.texture !== "clean"
      ? ` Texture must be: ${extraction.style.texture}.`
      : "";
    // Only strip branding when there is no product photo to copy it from.
    const noLogoNote = hasProductRef || !showsBottle
      ? labelNote
      : " CRITICAL: The product must NOT have any tags, labels, logos, branded text, hang tags, or any form of branding visible on it. The product should appear completely clean and unbranded.";

    instruction = product
      ? `Recreate this visual style featuring ${product.name}.${showsBottle ? " The product must match the reference images provided." : ""}${compositionNote}${noLogoNote}${ethnicityNote}${qualityNote}${textureNote}`
      : `Recreate this visual style with the described subjects and environment.${compositionNote}${ethnicityNote}${qualityNote}${textureNote}`;
  }

  if (notes) {
    instruction += ` Additional instructions: ${notes}`;
  }

  // In replica mode, send ONLY the simple instruction as prompt (no JSON extraction).
  // The original image is the reference - the JSON blob just confuses Nano Banana.
  let nanaBananaPrompt: string;
  if (isReplica) {
    nanaBananaPrompt = instruction;
  } else {
    nanaBananaJson.instruction = instruction;
    nanaBananaPrompt = JSON.stringify(nanaBananaJson);
  }
  return nanaBananaPrompt;
}

export function buildImageSwiperSystemPrompt(): string {
  return `You are an expert visual analyst. Extract every visual detail from the provided image as structured JSON. This JSON will be passed directly to an image generation model, so be extremely precise and detailed.

# CRITICAL: Camera Perspective & Human Actions

The MOST IMPORTANT thing to get right is the camera perspective and what any people are doing. These are the #1 cause of bad generations. Ask yourself:

- **Who is taking this photo?** Is it a first-person POV (photographer holding/showing something)? A selfie? A third-person shot? A tripod/studio shot?
- **What are the hands/body ACTUALLY doing?** "Hand touching pillow" is NOT the same as "person holding pillow out in front of them over a bed, first-person POV". Be specific about the exact action and body position.
- **Where is the camera relative to the scene?** Eye-level? Looking down at a surface? Looking up? Held at arm's length?

Examples of BAD vs GOOD descriptions:
- BAD: "Medium shot from above, bird's eye perspective looking down at bed surface"
- GOOD: "First-person POV — person holding the pillow with one hand, arm extended forward over their bed, camera at chest height looking slightly down at the pillow and bed below"
- BAD: "Person with hand on pillow"
- GOOD: "Person's left hand gripping the side of the pillow, holding it up at arm's length in front of them — only the hand and forearm are visible, rest of body is behind camera"

# Photo Quality & Naturalness

Describe the ACTUAL quality level of the image — do NOT assume studio perfection:
- Is it a casual phone photo with natural imperfections?
- Slightly overexposed or underexposed?
- Is the focus soft or slightly off?
- Does it look like a professional shoot or a real person's photo?
- Is the lighting natural/ambient or carefully set up?

This matters because the generated image should match the same quality level — a casual UGC-style photo should NOT become a studio-perfect shot.

# Structured Visual Extraction

Analyze the image and extract ALL visual details into this exact JSON structure:

\`\`\`json
{
  "scene": {
    "setting": "Describe the environment/location",
    "background": "Specific background elements, textures, wall colors with hex codes",
    "lighting": "Light direction, quality (soft/hard/diffused), color temperature (warm/cool), shadow behavior. Also note if lighting looks natural/casual vs studio-controlled",
    "atmosphere": "Overall environmental feel"
  },
  "composition": {
    "camera_perspective": "CRITICAL — exactly describe the camera position and who is taking the photo. e.g. 'First-person POV, camera held at chest height' or 'Third-person, eye-level tripod shot' or 'Overhead flat-lay from directly above'",
    "layout": "How the frame is organized (centered, rule-of-thirds, split/diptych, diagonal, etc.)",
    "framing": "Shot type (extreme close-up, close-up, medium, wide, etc.)",
    "focal_point": "What draws the eye and where",
    "negative_space": "How empty space is used",
    "aspect_ratio": "MUST be one of: 1:1, 4:5, 5:4, 3:2, 2:3, 16:9, 9:16"
  },
  "subjects": [
    {
      "type": "person | product | prop | text | graphic",
      "description": "Detailed visual description — ethnicity/skin tone, hair color and texture, age range, clothing, expression, material, color with hex codes",
      "position": "Where in the frame (center, top-left, bottom-third, etc.)",
      "action": "CRITICAL — describe EXACTLY what they are doing with their body, hands, arms. Not just 'touching' but HOW they are interacting. e.g. 'holding pillow with right hand at arm's length, palm underneath, fingers gripping the side'",
      "visibility": "What parts are visible? Full body, upper body, just hands, etc.",
      "is_competitor_product": false,
      "is_competitor_serving": false,
      "count": 1
    }
  ],
  "colors": {
    "palette": ["#hex1", "#hex2", "...at least 5 dominant colors"],
    "dominant_tone": "warm | cool | neutral",
    "contrast": "high | medium | low",
    "mood": "What the color palette communicates (e.g., 'Clean clinical whites with warm wood accents')"
  },
  "style": {
    "category": "lifestyle | studio | clinical | native-ad | UGC | editorial | graphic | before-after",
    "feel": "Describe the overall aesthetic in one sentence",
    "texture": "clean | grainy | soft-focus | sharp | matte | glossy",
    "exposure_and_grading": "Exposure and colour grading exactly as seen, flaws included - e.g. 'overexposed, blown-out window highlights, lifted washed-out shadows, low contrast, warm faded film tone' or 'correctly exposed, punchy contrast, neutral colours'",
    "photo_quality": "Describe the actual quality — e.g. 'casual phone photo, slightly soft focus, natural imperfections' or 'professional studio shot, tack-sharp, controlled lighting'"
  }
}
\`\`\`

# Rules

- Use specific hex color codes wherever possible (background colors, product colors, clothing colors)
- **Mark the competitor's product in two slots** (each at most once, either may be absent):
  - \`"is_competitor_product": true\` on the PACKAGE of the advertised product (bottle, can, jar, tub, pouch, box). If several identical packages appear together (e.g. three cans in one hand), describe them as ONE subject and set \`"count"\` to how many. If the same product appears in SEPARATE places (e.g. two bottles in different corners), mark EVERY one of them - no unit of the competitor's product may be left unmarked.
  - \`"is_competitor_serving": true\` on the product in PREPARED form: a glass or cup with the drink, a bowl or scoop with the powder, a shot glass. If several people each hold a glass of it, mark EVERY one of those glasses. Each glass is its OWN subject (type "product") with its own position - put the flag on the glass, NEVER on the person holding it.
  - If no package is visible, do NOT invent one - mark only the serving. If the image shows neither, mark nothing.
- **Read hands literally.** Before describing an interaction, check whose arm each hand belongs to. A person holding their own glass to their mouth is drinking - do not describe it as someone else feeding them unless that is unmistakable.
- **camera_perspective is the MOST important field** — get this wrong and the entire generation will look nothing like the original
- **action descriptions must be specific and physical** — describe exact hand positions, grip, arm angles, body posture
- **For person subjects, ALWAYS explicitly describe: ethnicity/skin tone (e.g. "Caucasian woman with fair skin", "East Asian man with warm beige skin tone"), hair color and texture (e.g. "straight dark brown hair", "curly black hair"), and approximate age range (e.g. "mid-40s"). These details are CRITICAL for accurate reproduction.**
- Be precise about lighting direction (e.g., "soft light from upper-left, no harsh shadows")
- Be precise about composition (e.g., "product occupies lower-right third, person upper-left")
- Describe each subject in enough visual detail that an image generator could recreate it
- Do NOT describe the competitor product's brand name — just its physical appearance
- **NEVER include logos, brand tags, watermarks, or branded overlays** in the extraction — skip them entirely from the subjects list. The competitor's branding must not appear in the generated image.
- **NEVER include overlaid text** (headlines, slogans, captions, prices, badges) as subjects — the generated image has no overlay text by default. Only if the user's notes explicitly ask for a text (keep it, change it, add one) include it as they say.
- **This applies to EVERY field**, not only the subjects list: do not mention text blocks, headlines or typography in composition, focal_point, negative_space, scene or style either. Describe that area as the empty background it would be without the text - otherwise the image model paints new text there.
- **Outside the marked subjects, call the competitor's product just "the product"** (e.g. "the product held in the raised hand"), never by its colour, shape or packaging type - those words reach the image model and bring the competitor's package back.
- If the user provides additional notes/instructions, APPLY them to the extraction. For example: "change 60 days to 100 days" → modify the text subject's description to say "100 days". "Remove the badge" → omit that subject entirely. "Make the background blue" → update the background and color palette accordingly.

Return ONLY the JSON object. No markdown fences, no extra text.`;
}

export function buildImageSwiperUserPrompt(imageUrl: string, notes?: string, person?: string): string {
  let prompt = "Extract every visual detail from this image as structured JSON.";

  if (person) {
    // Changing the person here, not in the image prompt, keeps the subject
    // description consistent - otherwise it still says the original age and
    // ethnicity and the image model gets two conflicting people.
    prompt += `\n\n**Person:** The main person in the image (if there are several, the most prominent one) must be described as: ${person}. Write that person's subject description with this identity instead of what you see, and fill in anything not given (e.g. hair colour) so it fits. Keep their clothing, pose, expression and action exactly as in the image.`;
  }

  if (notes) {
    prompt += `\n\n**Additional Notes:** ${notes}`;
  }

  return prompt;
}
