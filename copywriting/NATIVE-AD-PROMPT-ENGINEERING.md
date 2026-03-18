# Native Ad Prompt Engineering for Nano Banana

> Synthesized from research of 1,708 real native ads, 33+ expert X/Twitter posts (primarily @advertising_jan), 30+ web sources, and extensive AI image generation best practices. Last updated 2026-03-18.

## Core Principle

The best native ads don't look like ads. They look like the content users already consume in their feed. For AI-generated images, this means deliberately introducing the imperfections and characteristics of real phone photos, amateur snapshots, and organic social media content.

**The critical insight:** "The less a creative LOOKS like AI, the better." Visually appealing does not equal high ROAS. The winning formula is AI-generated images that look human-made.

---

## 1. Words to NEVER Use in Prompts

These words trigger AI artistic bias and make images look generated:

| AVOID | WHY | USE INSTEAD |
|-------|-----|-------------|
| "hyper-realistic" | Triggers over-rendering for PHOTO styles. **OK for medical/scientific** | "photography", "shot of" (photos); keep for medical |
| "photorealistic" | Gives a "digitized" appearance | "RAW photo", "candid" |
| "ultra-realistic" | Same problem | "high-fidelity", "snapshot" |
| "cinematic" | Triggers dramatic color grading | "documentary", "editorial" |
| "perfect lighting" | Unnaturally even illumination | "natural window light" |
| "beautiful" | Triggers AI beautification | "authentic", "genuine" |
| "magical" / "ethereal" | Fantasy rendering | "natural", "organic" |
| "vibrant colors" | Over-saturation | "muted tones", "natural color grading" |
| "professional" | Too polished for native ads | "casual", "everyday" |
| "dramatic" | Stylization trigger | "honest", "observational" |
| "studio lighting" | Screams commercial | Name the actual light SOURCE |

---

## 2. The Realism Anchor Toolkit

### Camera/Device References
Mentioning specific camera gear tells the AI what depth of field, noise profile, and quality to simulate:

- **UGC/amateur:** `"iPhone 15 Pro front camera"`, `"phone camera quality"`, `"taken with phone flash"`
- **Lifestyle/editorial:** `"35mm lens"`, `"Canon EOS R5 with 85mm f/1.8"`, `"shallow depth of field"`
- **Documentary:** `"shot on Nikon Z9 with 50mm f/1.4"`, `"photojournalism style"`
- **Close-ups:** `"macro lens"`, `"Nikon Micro-NIKKOR 105mm"`

### Film Stock References
Film stocks introduce organic grain, color science, and warmth that masks the digital AI look:

- **Kodak Portra 400** — "Weirdly powerful" for authenticity. Fine grain, warm skin tones, natural colors
- **Cinestill 800T** — Tungsten-balanced, halation around highlights, cinematic night look
- **Ilford HP5 pushed one stop** — Gritty, high-contrast documentary feel (B&W)
- **Kodak Ektar 100** — Ultra-fine grain, vivid but realistic colors
- **Fujifilm Velvia** — Rich, saturated colors for product/landscape

Usage: Append as modifier: `"...Kodak Portra 400 aesthetic, subtle film grain"`

### Imperfection Keywords
Real cameras produce flaws that AI typically omits:

- `"motion blur"` — handheld/action shot feel
- `"slight vignetting"` — darkened corners, vintage/phone camera
- `"chromatic aberration"` — color fringing at edges, cheap lens
- `"lens flare"` — outdoor realism
- `"focus slightly soft"` — imperfect autofocus
- `"natural noise"`, `"film grain"` — texture
- `"light leaks"` — analog film artifact

### Texture Keywords (Breaking "Digital Smooth")
Every surface in a real photo has micro-detail:

- **Skin:** `"visible pores, natural texture, light imperfections, subtle oil sheen, no smoothing"`
- **Fabric:** `"fabric grain, visible weave, slight wrinkles, natural drape"`
- **Wood:** `"weathered wood, visible grain, slight warping"`
- **Environment:** `"chipped paint, dusty surfaces, lived-in space"`

### Lighting (Name the SOURCE, Not the Effect)
Describe WHERE the light comes from, not what it looks like:

| Desired Feel | Lighting Keywords |
|---|---|
| Morning/wellness | `"soft window light"`, `"golden hour sunlight"`, `"warm morning glow"` |
| Authentic indoor | `"fluorescent overhead lights"`, `"desk lamp"`, `"practical lighting"` |
| Documentary/real | `"overcast daylight"`, `"dappled sunlight"` |
| UGC/amateur | `"direct camera flash"`, `"harsh shadows"`, `"screen glow"` |
| Evening/intimate | `"warm glow from fireplace"`, `"candle light"`, `"tungsten bulb"` |

### Color Restraint
AI defaults to oversaturated colors. Always pull back:

- `"natural colour grading"`, `"muted tones"`, `"earthy colour palette"`
- `"soft highlights and deep shadows"`, `"low saturation"`
- `"desaturated"`, `"natural contrast"`

---

## 3. The Prompt Formula

**[Subject first] + [Action/context] + [Environment/setting] + [Lighting source] + [Texture/imperfection] + [Color/tone] + [Camera reference or style suffix]**

### Example (native-closeup, disgusting object):
> "A yellowed, sweat-stained pillow on a bare mattress, the cotton cover slightly pulled back revealing flat, clumped filling inside. Morning light from a window casting honest shadows across the creased fabric. Visible fabric grain and dust particles in the light. Muted, desaturated tones. Shot as editorial product photography for a health magazine feature."

### Example (native-messy, 3AM moment):
> "A phone on a dark nightstand showing 3:47 AM with a sleep tracking app open, next to a half-empty glass of water and scattered ibuprofen pills. Only the phone screen illuminates the scene with cool blue glow. Natural noise, slightly grainy. iPhone photo aesthetic, candid, slightly off-center framing."

### Example (native-medical, pencil sketch):
> "Detailed hand-drawn anatomical illustration of cervical spine alignment in two sleeping positions, rendered in pencil and charcoal on aged cream paper. Fine crosshatching for shadows, delicate labels in serif font pointing to vertebrae C3-C7. Warm sepia tones with subtle yellowing at paper edges. Detailed medical textbook illustration style."

---

## 4. The "Is This An Ad?" Test

Every native image must pass this test. If a user scrolling their feed would immediately identify it as advertising, it fails. Checklist:

- [ ] No logos, brand colors, or custom brand fonts
- [ ] No white/studio backgrounds
- [ ] No perfect symmetry or centered composition
- [ ] No ring-light catchlights in eyes
- [ ] No stock photography feel
- [ ] Has environmental "mess" (clutter, imperfect framing)
- [ ] Uses natural, unposed actions or candid moments
- [ ] Has the quality/feel of the platform's native content

---

## 5. Visual Categories from 1,708 Real Native Ads

From analyzing the top-performing native static ads:

1. **Medical/anatomical illustrations** — Pencil sketches, CT/MRI visualizations, microscopy, fabric/textile 3D models, comic/graphic novel, infographic diagrams
2. **Disgusting object photography** — Stained pillows, gross close-ups, provocative objects that trigger visceral reactions
3. **UGC/selfie style** — Mirror selfies, bathroom selfies, front-camera photos
4. **Handwritten sign selfies** — Person holding cardboard/whiteboard with handwritten message
5. **Relationship/intimacy scenes** — Couple moments, romantic setups, private/voyeuristic moments
6. **Text-only cards** — Bold serif text on solid color backgrounds (functions as native content)
7. **Flat-lay comparisons** — Objects arranged on surface telling before/after story
8. **Scene-of-the-crime** — Messy beds, nightstands, evidence of the problem

---

## 6. Key Performance Data

- Static images drive **60-70% of conversions** on Meta
- Ugly/native ads get **3x higher clicks** and **3-5x higher conversion rate** vs polished (Dara Denney)
- UGC with text overlay: **+38% ROAS** vs plain UGC (Deepsolv, 40K ads)
- Ugly ads brand lift: **+30%** in action intent (Barry Hott, Lone Ranch Water)
- First-person POV: **+9% clicks**, **+43% engagement**
- Founder content: **2.3x higher engagement**, **2.8x longer watch time**
- Creative fatigue now hits in **2-3 weeks** (was 6-8 weeks pre-Andromeda)
- **70-80% of Meta ad performance** stems from creative quality, not budget/targeting

---

## 7. The Image-Headline Relationship

The image and headline must do **TWO DIFFERENT JOBS**:
- **Image** → creates an emotion or unanswered question (recognition, disgust, curiosity, empathy)
- **Headline** → answers it halfway, opens a curiosity gap the reader can only close by clicking

If the image shows a stained pillow and the headline says "dirty pillows cause health problems" — they're saying the same thing. Wasted click.

Instead: Image shows stained pillow (creates "ugh, is mine like that?") → Headline: "The nighttime habit aging your skin 10 years faster (it's not sugar)" (redirects to a DIFFERENT question).

**Key insight from @advertising_jan:** "If your image and headline are saying the same thing, you're wasting the click. They should be doing two different jobs."

---

## 8. Headline Formulas (from 6,438+ native ad headlines)

**Master formula:** `[Specific detail] + [unexpected connection] + [implied secret]`

**Winning structure:** `"The [timeframe] [habit] that's [consequence] (it's not [obvious thing])"`

**7 Structures That Actually Get Clicks:**

| # | Structure | Example |
|---|-----------|---------|
| 1 | **Mistake Frame** | "The nighttime habit that's aging your skin 10 years faster (it's not sugar)" |
| 2 | **Insider Leak** | "Dermatologists in Korea have been using this since 2014. The US just caught on." |
| 3 | **Accidental Discovery** | "She cleared her adult acne in 11 days. Her secret wasn't a product." |
| 4 | **Contradiction** | "Why your moisturizer stops working after 3 weeks (and what to switch to)" |
| 5 | **Specific Number** | "The 3pm craving that's secretly adding 600 calories to your day" |
| 6 | **Not What You Think** | "The kitchen ingredient that tightens skin better than most serums" |
| 7 | **Quiet Trend** | "People with [condition] are quietly switching to [unexpected thing]" |

**Anti-pattern:** Direct benefit claims = worst performers. Curiosity beats clarity every time.

**Anti-AI voice rules for headlines:**
- No triads ("powerful, effective, and natural")
- Never use: "journey", "transform", "unlock", "discover", "game-changer", "revolutionary"
- Use contractions naturally (don't, won't, can't)
- Include specific numbers/details ("4 months" not "weeks")
- Sentence fragments are fine. Like this.

---

## 9. Advertorial Principles

From @advertising_jan's article "Your Advertorial Dies In The First 150 Words":

- **Never mention the product in the first 150 words** — the product name doesn't appear until paragraph 8
- Eight paragraphs of pure education. Zero selling.
- By the time the reader sees the product, they've already convinced themselves they need a solution

**3 Hook Types for Advertorials:**
1. **Story Hook** — personal narrative mirroring the reader's experience
2. **Shock Hook** — statistic or fact breaking long-held assumptions
3. **Question Hook** — a question so precise it feels like mind-reading

**5 Golden Rules:**
1. Never mention the product in the first 150 words
2. The final hook sentence must create a curiosity gap
3. Write the hook LAST, after the mechanism section
4. If it sounds like a product page, rewrite it
5. Test your hook on someone unfamiliar with the product

---

## 10. Funnel Congruency

Everything must feel like it came from the same source:

- Profile picture → Page name → Body copy → CTA → Advertorial → Landing page

"If your ad looks like it's from 'tara's weight loss journey' but the lander screams 'buy our supplement now,' the trust breaks instantly."

**The emotional thread:** You're not creating a new emotion. You're borrowing one the reader already has. The image triggers recognition → the headline validates → the advertorial deepens → the product resolves.

---

## 11. Expanded Image Categories (from 33+ expert posts)

Updated categories beyond the original 8:

| Category | Description | When to use |
|----------|-------------|-------------|
| **Medical/Anatomical** | Cross-sections, X-ray scans, vintage plates, skin diagrams, dental X-rays | Joint pain, sleep, heart, aging, dermatology |
| **Disgusting Object** | Stained pillows, bruised produce, parasites, gross close-ups | Hygiene, cleaning, health supplements |
| **Body Close-up (Suffering)** | Sun-damaged hand, swollen knee grip, chest clutching, stomach holding | Pain, aging, heart health, digestive |
| **Emotional Isolation** | Person suffering while others are fine — park bench vs joggers, party vs migraine, café vs productive friends | Fatigue, migraine, digestive, chronic conditions |
| **Scene-of-the-Crime** | Nightstand insomnia, desk exhaustion, bed sweat stains, open fridge at 3 AM | Sleep, stress, diet, burnout |
| **Refrigerator/Cupboard Interior** | Inside-the-fridge perspective showing intention vs reality tension | Diet, supplements, nutrition |
| **Flat-lay Objects** | Vitamin clutter, cable tangles, desk wear — objects tell an emotional story | Supplements, health, productivity |
| **Comic/Illustration** | Comic-strip screaming feet, bacteria petri dish | Foot pain, hygiene, fun pattern interrupt |
| **UGC/Reddit-style** | Mirror selfies, Reddit-post remakes | Weight loss, skin, hair |
| **Text-only Cards** | Bold text on solid backgrounds | Any — pattern interrupt |

---

## 12. Object Storytelling Technique

In scene-of-the-crime and flat-lay prompts, each object carries emotional meaning through its CONDITION:

- A cap sitting separately from its tube (someone was rushed/exhausted)
- A half-peeled orange with spiral rind (interrupted action)
- One dry leaf dropped beside a succulent (neglect)
- Two overlapping coffee rings — one dark/recent, one pale/old (accumulated time)
- A crumpled handwritten note in smudged pen (personal, intimate)
- A mechanical pencil with lead retracted (abandoned task)

The objects ARE the story. Their wear and arrangement describe a specific person at a specific moment. The prompt should name each object's position, condition, and relationship to others.

Anchor the emotional tone to a specific time: "3:47 AM", "the specific exhaustion of 4:30pm on a Wednesday", "the particular silence of a house at 2 AM."
