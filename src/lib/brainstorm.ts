import type {
  ProductFull,
  CopywritingGuideline,
  ProductSegment,
  BrainstormMode,
  BrainstormRequest,
  AdTemplate,
  Angle,
  AwarenessLevel,
} from "@/types";
import { parseConceptProposals } from "./concept-generator";

// Re-export for convenience
export { parseConceptProposals };

// ---------------------------------------------------------------------------
// Knowledge bases embedded in prompts
// ---------------------------------------------------------------------------

const CASH_FRAMEWORK = `## C.A.S.H. Framework (Concepts, Angles, Styles, Hooks)

CONCEPT TYPES (the core insight bucket):
- avatar_facts: Raw truths about the audience (pain expressions, core wounds, buying triggers)
- market_facts: Competitive landscape intelligence (solutions tried, cultural influences)
- product_facts: Truth about the solution (discovery story, mechanism, proof)
- psychology_toolkit: Techniques to reshape understanding (metaphors, paradoxes)

ANGLES (psychological entry point — each creates a different "lens" on the same concept):
Story, Contrarian, Expert Crossover, Root Cause, Accidental Discovery, Tribal, Conspiracy, Geographic, New Science, Symptom Reframe, Worldview, Case Study, Before/After, Comparison, Social Proof, Educational, Fear-Based, Aspirational, Curiosity, Problem-Agitate

STYLES (creative execution format):
Product Shot, Lifestyle, UGC-style, Infographic, Before/After, Testimonial, Meme, Screenshot, Text Overlay, Collage, Comparison

AWARENESS LEVELS:
- Unaware: Doesn't know they have a problem. Need curiosity + disguised entry
- Problem Aware: Knows the pain, hasn't found a solution category yet
- Solution Aware: Knows solutions exist, hasn't picked one
- Product Aware: Knows your product, needs final push
- Most Aware: Ready to buy, just needs an offer/reminder

COPY BLOCKS (P3C2 — see COPY BLOCKS DEEP FRAMEWORK below for full system):
- Pain (5 levels: General → Specific → Cinematic → Emotional → Core Wound)
- Promise (5 levels: General → Specific → Cinematic → Emotional → Core Transformation)
- Proof (22 types across 5 categories — use Proof Braid to pair with claims)
- Curiosity (the MOST important block — use S.E.E.N. + Epiphany Threshold + Characterizations)
- Constraints (Big Three: Money, Time, Effort — use A.W.E. to dissolve deeper objections)
- Conditions (urgency, scarcity, risk reversal, qualifications)

KEY PRINCIPLE: The same product can have hundreds of unique ad concepts by varying Concept × Angle × Style × Hook. Each proposal MUST use a DIFFERENT angle to maximize creative coverage.`;

const STORMING_SOURCES = `## S.T.O.R.M.I.N.G. — 8 Sources of Ad Ideas

1. Swipes (competitor) — Study what's spending & scaling. Reproduce and iterate.
2. Templates — Proven formats that have worked for decades. Battle-tested structures.
3. Organic — Organic creators are often better at hooks than paid copywriters. Steal viral structures.
4. Research — Comments on ads, Reddit threads, YouTube comments. Where there's friction there's attention.
5. Matrix/Coverage — Go full systematic. Carpet bomb every angle × concept × awareness level.
6. Internal Vectors — Lines buried inside winning ads that should be their own ad. Pull strong ideas forward.
7. New Style/Format — Style-first approach: find a visual style grabbing attention anywhere, then ask what idea fits.
8. Gambits (Wildcard) — Weird ideas, random inspiration, gut feelings. Every portfolio needs some swings in the dark.`;

const AVATAR_FACTS_FRAMEWORK = `## Avatar Facts Collection System (What to mine for concept ideas)

A. IDENTITY — Demographics, self-concept deep beliefs ("I am someone who..."), core problem statement, cultural touchstones, meaningful symbols
B. EXPERIENCE — Pain expressions (5 layers: General → Specific → Cinematic → Emotional → Core Wound), pain evolution, what they see/hear/say/think/feel/do, behavioral patterns, buying triggers, language patterns
C. MOTIVATION — Promise levels (5 layers: General → Specific → Cinematic → Emotional → Core), desire depth, transformation vision, status needs, security needs, relationship impact
D. RESISTANCE — Identity constraints ("I'm not someone who..."), values constraints, belief constraints, experience constraints, resource constraints, core objections, secondary gains, who/what they blame
E. MEDIA CONSUMPTION — Platforms, content types, influencers, attention triggers

SCROLL-STOPPING PATTERNS:
- Weird Facts: Unexpected truths that make them stop and think
- Magic Words: Specific charged words (free, secret, hidden, forgotten, banned, leaked)
- Weird Methods: Unusual approaches that create curiosity (the "banana trick", "pillow hack")
- Loopholes: Perceived shortcuts that bypass expected effort`;

const COPY_BLOCKS_DEEP = `## COPY BLOCKS DEEP FRAMEWORK

The 6 building blocks of persuasive copy. Use these to write stronger hooks, ad copy, and characterizations.

### PAIN BLOCK — 5 levels of emotional depth

Pain Chain (build general → devastating):
1. General Pain: Surface problem statement
2. Specific Pain (x2-3): Concrete, measurable details
3. Cinematic Pain: Movie-scene description of the pain in their daily life
4. Emotional Pain: The feeling underneath the surface
5. Core Wound: The existential fear (use sparingly, indirectly)

Pain Matrix dimensions that shape which pain blocks work:
- Psychological markets → stories that evoke past pain
- High-stigma markets → remove shame before addressing pain
- Measurable markets → concrete numbers and specifics

The goal: make the prospect feel UNDERSTOOD, not lectured.

### PROMISE BLOCK — 5 levels (stack them, hard to overdo)

Promise Ladder:
1. General Promise: Big-picture outcome
2. Specific Promise: Concrete, measurable result with timeline
3. Cinematic Promise: Movie-scene of life after the transformation
4. Emotional Promise: How it FEELS to have the outcome
5. Core Transformation: The ONE thing they want if they could snap their fingers

Key rules:
- Most copy has too FEW promises, not too many
- Core Transformation = the single outcome everything ladders up to
- Show the transformation through daily life scenes, not abstract claims

### PROOF BLOCK — Creates the FEELING of trust, not a legal argument

Proof Braid: Pair every promise/claim with proof immediately (like Siamese twins).
Proof Balance Scale: Big promises need big proof. Small promises need small proof.

22 Proof Types across 5 categories:
1. PSYCHOLOGICAL (most underutilized): Technical Jargon, Candid Communication, Explanatory Reasoning, Logical Arguments, Guarantees
2. EXPERIENTIAL (most convincing): Testable Proof, Demonstration, Trials/Samples, Challenges, Comparisons, Before/After
3. EMPIRICAL: Studies/Research, Stats/Evidence, Infographics
4. CREDIBLE: 3rd Party Certs, Track Record, Expert Endorsements, Media Coverage, Awards
5. SOCIAL: Testimonials/Reviews, Case Studies, Social Media Metrics

Rules: Harder to fake = stronger. Match proof weight to claim weight. Experiential > all.

### CONSTRAINTS BLOCK — What holds them back from buying

Big Three (always address): Money, Time, Effort.
Address in hooks/headlines: "Without expensive X, complicated Y, or hours of Z"

Resonance Hierarchy (Experiences → Beliefs → Values → Identity):
- Things CRYSTALLIZE going up — identity hardest to change
- Work AROUND identity/value constraints (don't challenge directly)
- DISSOLVE belief/experience constraints with counterexamples

A.W.E. Framework (for dissolving constraints):
A = Acknowledge: Validate their belief to lower resistance
W = Wedge: Use counterexamples to open new possibilities (BOTH/AND, not EITHER/OR)
E = Elaborate: Expand the new reality the wedge created

### CURIOSITY BLOCK — The MOST important block. Bridges the gap between Pain and Promise.

Two parts: IDEA (what you're saying) + FRAME (how you present it).

Curiosity Quadrant (4 things to talk about):
- External Problem (market's view of what causes the problem)
- Internal Problem (YOUR view of what causes the problem)
- External Solution (market's view of what fixes it)
- Internal Solution (YOUR product's unique approach)

S.E.E.N. Framework (4 qualities of insightful ideas):
S = Simple (easy to understand), E = Easy (simple to do), E = Explanatory (explains their reality better — the "aha moment"), N = Novel (something new — familiar = tuned out). Last two matter MOST.

Epiphany Threshold: Sliding scale 0-10. Sweet spot = 6-8. Too obvious (1-3) = boring. Too extreme (9-10) = unbelievable.

Characterization tools (for naming mechanisms):
1. Evocative Naming: Reveal just enough (not too obvious, not too blind). Strong: "Hidden Constipation" / "Joint Drought". Weak: "3-Step Success System".
2. Intuition Pumps: Relate to something familiar (natural metaphors, mechanical metaphors, body-feel of the problem)
3. Anti-Constraints: Dissolve objections IN the name itself ("Lunchbreak Millionaire Protocol", "Copy-Paste Traffic System")
4. Idea Caricatures: Exaggerate sexy/taboo/easy aspects of the core idea to create compelling characterizations

### COPY QUALITY TOOLS

C.R.A.V.E.S. — Make any copy block stronger:
C = Clear (understandable above all), R = Relevant (something they care about), A = Accurate (their actual language), V = Visual (they can picture it like a movie), E = Expressive (emotionally charged power words), S = Specific (concrete details, not vague)

Copy Velocity: More copy blocks in fewer words = stronger copy. Cut filler ruthlessly.

Copy Blocks Equation: (Promise × (Proof × Curiosity)) / Constraints × Conditions = Value`;

const UNAWARE_AD_TYPES = `## 4 Types of Unaware Ads

Unaware ads turn someone who wasn't looking for anything into someone who needs what you sell, by leading with curiosity, not the product.

### 1. STRADDLE ADS (Curiosity + Relevance)
"Straddle" the line between Unaware and Problem Aware. Require two elements: High Curiosity + Broad Relevance.

Curiosity triggers that always work:
- Authority references: NASA, MIT, Harvard, Stanford, Nobel Prize, new study, clinical trial, declassified, buried study
- Exotic/tribal references: Okinawans, Sardinians, Hadza, Tibetan monks, Japanese centenarians
- Historical/ancestral: Ancient Egyptians, your grandmother, before electricity, Depression-era
- Elite performers: Navy SEALs, Olympic athletes, astronauts, Silicon Valley executives

Relevance spectrum (broad → narrow, charge increases):
- Existential: death, aging, health, wealth, love (broadest)
- Mechanism: inflammation, cortisol, metabolism (medium)
- Condition: insomnia, neuropathy, chronic pain (narrower)
- Sensation: waking at 3am, tingling in feet, brain fog at 2pm (narrowest, highest charge)

Formula: [Curiosity element] + [Relevance pain/promise]
Examples:
- "Watch what nuts do to your body"
- "In 1910, Rockefeller funded a report that forever reshaped medicine"
- "My Uber driver said 5 words that changed my view on men"

### 2. SYMPTOM ADS (Reference + Reframe)
Take something neutral (behavior, habit, observation) and raise its stakes by revealing it as a symptom of a problem they didn't know they had.

Pattern: [Neutral reference] → [Reframe as symptom/warning]
Examples:
- "Is your dog eating grass?" → "That's actually a sign of digestive distress"
- "If you need coffee to wake up, your mitochondria are already 40% dead"
- "Does your pup have floppy ears? You could have an infected disaster around the corner"
- "Look at your dog's tongue. If you see this, call your vet immediately"

### 3. WORLDVIEW PORN (Emotional Reservoir → Product)
Every person has emotional energy stored in specific places: institutional distrust, generational resentment, pet owner anxiety, gender dynamics. Tap these reservoirs and redirect toward your product.

Steps:
1. Tap Emotional Reservoir (Validate, Reject, or Refine a deeply held belief)
2. Explain the Why (connected to your domain)
3. Show Them the COST (you've been robbed/deceived)
4. Establish Mechanism/Product/Offer as way to reclaim this

Core desires to activate: Hope, Absolution, Safety, Validation, Common Enemy, Purpose, Understanding, Certainty, Identity, Permission, Exclusivity, Clarity, Superiority

Examples:
- "Boomers bought houses on a single income. Now you need a Master's and two roommates"
- "Remember 2020? When grocery stores emptied? Nobody called you paranoid then"
- "Doctors are finally admitting what chiropractors knew all along"

WARNING: Hardest ads to write. Get high engagement but must wrestle the energies with belief chains.

### 4. STORY ADS (P.I.G. Openings)
Open with a powerful P.I.G. line (Place, Identity, Gritty detail) to hook readers into a narrative.
Must: reflect reader's experience back to them, use open loops, maintain realistic tone.

P.I.G. = Place + Identity + Gritty Detail
Creates an immediate cinematic opening that readers can't look away from.

Overall unaware ad structure:
- Hook (1-2 sentences)
- Payoff (500-2000 words): Story or other angle content
- TRANSITION
- Mechanism (200-300 words): Problem → Intermediary → Mechanism
- Solution (200-300 words): Solution → Unique Solution
- Product (150-300 words): What's different?
- Offer (50-100 words): Why buy now?`;

const NATIVE_AD_PSYCHOLOGY = `## Native/Editorial Ad Psychology

CORE INSIGHT: The ads that print the most money are the ones that don't look like ads at all. People's guard is down with native content — completely different psychology than standard display.

WHY "UGLY" BEATS "BEAUTIFUL":
- Banner blindness: After 25+ years of internet ads, brains filter anything that "looks like an ad." Polished = ignored. Raw = noticed.
- Reading environment: Open web is information-processing mode. Editorial images fit. Product shots break it.
- Curiosity gap: Pretty images answer themselves ("Oh, that's a product"). Weird images create questions. Gap → click.
- Trust transfer: Medical-style illustration next to news article inherits editorial credibility.
- Involuntary attention: Mild disgust is one of the most powerful attention triggers. You can't NOT look.

3 WINNING IMAGE TYPES:
1. Medical illustrations — Cross-sections, anatomical diagrams, microscope close-ups. Look like they belong next to WebMD.
2. Uncomfortable close-ups — Skin conditions, swollen joints, bruised food. Triggers hard scroll-stop.
3. Messy real-life scenes — Cluttered kitchen counter, medicine cabinet, bedside table with supplements. Relatable, not aspirational.

DESTINATION: Always send to advertorial/educational content, NOT product page. Informed buyers convert 3-4x better.

RULE: If it makes your designer uncomfortable, it probably converts.`;

export const HEADLINE_FORMULAS = `## PROVEN HEADLINE FORMULAS (From Scaled Native Ads)

These structural formulas come from headlines that have actually scaled on native ad platforms. Adapt the brackets to your product. Keep the structure. NEVER use the examples verbatim — they show the PATTERN only.

### BY PSYCHOLOGICAL MECHANISM

**Authority Reveal** — Borrows credibility from a trusted figure
1. "[Authority] reveals: [surprising claim about symptom]"
2. "[Authority figure] exposed the [industry] secret about [symptom]"
3. "[Authority]: [imperative action] if you have [condition]"

**Unexpected Cause** — Reframes what they think is causing the problem
4. "The [unexpected] reason [symptom] gets worse after [age]"
5. "[Problem] has nothing to do with [expected cause]. Stop doing [this common thing]"
6. "A new study found the real reason [problem] happens. It's not [common belief]."

**Time-Locked Trick** — Specificity creates believability
7. "[X]-second [method] [eliminates/fixes] [problem]"
8. "The [timeframe] pattern that [percentage] of adults over [age] experience"

**Geographic/Cultural Secret** — Exotic origin = curiosity + authority
9. "People in [country] have done this since [year]. [Your country] just caught on."
10. "Why [age]-year-old [nationality] never get [condition]"
11. "How a long-forgotten [cultural] tradition [result]"

**Social Proof Scale** — Specific numbers beat vague claims
12. "Why [X,XXX+] [demographic] swear by this [method/product]"
13. "[Specific person] [achieved result] in [timeframe]. [Authority] asked how."

**Food/Substance Trigger** — Everyone eats, universal relevance
14. "[Food/drink] [does something alarming] to your [body part]"
15. "Cut out this 1 [food] and watch your [symptom] [dramatic improvement]"

**Named Mechanism** — Giving the method a name makes it memorable and shareable
16. "The '[evocative name]' [epidemic/method/trick] [consequence]"
17. "'[Metaphor name]' [action verb] [result] in [timeframe]"

**Nighttime/Morning Ritual** — Time-of-day specificity + routine = easy action
18. "The nighttime habit that's [negative consequence] (it's not [obvious thing])"
19. "Do this [duration] [time of day] trick for [benefit] every [time period]"

**Warning/Contrarian** — Pattern interrupt through alarm
20. "Why [common solution] stops working after [timeframe] (and what to do instead)"
21. "The #1 mistake people make when trying to fix [problem]"

**Symptom Reframe** — Takes something neutral/normal and reveals it as a warning sign (from Copy Blocks)
22. "If you [common behavior], your [body part/system] is already [alarming state]"
23. "[Normal habit] is actually a sign of [hidden condition]"

**WMTD (What Makes The Difference)** — Compares two similar things with different outcomes to create curiosity gap (from Copy Blocks)
24. "These two [subjects] are the same [shared traits] — yet one [good outcome] and the other [bad outcome]. What makes the difference?"

**Taboo Solution** — Presents the solution as something they "shouldn't" be doing (from Copy Blocks Idea Caricatures)
25. "Eat this '[forbidden food type]' before bed to [desired result]"
26. "[Do forbidden thing] to [achieve desired outcome] (yes, really)"

**Anti-Constraint** — Dissolves the main objection IN the headline itself (from Copy Blocks)
27. "[Indulgent method] [achieves result] without [expected sacrifice]"

### STRUCTURAL MODIFIERS (combine with any formula above)

- **Specificity anchors**: Use exact numbers (32,684 not "thousands"), ages (after 40, not "middle-aged"), timeframes (7 seconds, not "quickly")
- **Parenthetical twist**: Add a surprise or negation in parentheses — "(not what your doctor says)", "(it's not [obvious thing])", "(and it's not what you think)"
- **Lowercase casual**: For social feeds, lowercase + casual tone outperforms formal
- **Question reframe**: Turn any statement into a question for higher engagement on some placements
- **Quiz format**: "[QUIZ] Which [thing] should you [action] to [result]?" — interactive feel`;

const AD_TEMPLATES = `## 14 AD TEMPLATES (Copy Blocks System — 3-part structures)

Each template is a proven ad structure with an Opening → Middle → Close flow. Follow the template's structure when writing ad_copy_primary.

### 1. BEFORE & AFTER (Transformation Contrast Hook)
Opening: Dramatic contrast between struggle and success — specific timeframes
Middle: Vivid pain state → transformation moment → specific proof of results
Close: Bold promise + CTA reinforcing the transformation

### 2. INSIDER REVEAL (Exclusivity Curiosity Hook)
Opening: Tease exclusive/hidden information most people don't know
Middle: Reveal insider knowledge piece by piece + proof it works
Close: How to access this secret + CTA

### 3. FRAMEWORK INTRODUCTION (Complexity Contrast Hook)
Opening: Acknowledge the overwhelming complexity of their problem
Middle: Introduce a named system/framework that simplifies everything
Close: Show predictable results + CTA

### 4. QUICK WIN (Speed-Result Contrast Hook)
Opening: Promise fast, tangible result with minimal effort
Middle: Walk through simple steps producing the quick win
Close: Bridge from quick win to bigger transformation + CTA

### 5. INDUSTRY AUTHORITY (Recognition Gap Hook)
Opening: Contrast between unknown beginners and recognized experts
Middle: Reveal what authorities do differently (the mechanism)
Close: Path to authority status + CTA

### 6. HIDDEN COST (Invisible Pain Hook)
Opening: Reveal an invisible cost they didn't know they were paying
Middle: Quantify the damage, show why it's been invisible
Close: How to stop the hidden bleeding + CTA

### 7. IDENTITY SHIFT (Identity Crisis Hook)
Opening: Challenge their self-image as the source of struggles
Middle: Show how identity (not tactics) determines results
Close: The new identity + how your product enables it + CTA

### 8. PATTERN INTERRUPT QUESTION (Perspective-Shattering Question)
Opening: Ask a question that shatters their current perspective
Middle: Explore why the conventional answer is wrong
Close: Paradigm-shifting answer + your solution + CTA

### 9. OVERLOOKED FACTOR (Missing Element Hook)
Opening: "Everyone focuses on X, but the REAL reason is Y"
Middle: Build the case for the overlooked factor with proof
Close: How addressing this one factor changes everything + CTA

### 10. BOTTLENECK BREAKTHROUGH (Bottleneck Revelation Hook)
Opening: Identify the single constraint preventing all results
Middle: Explain why removing this one bottleneck unlocks everything
Close: How your solution removes the bottleneck + CTA

### B1. EFFORTLESS PIVOT (Tiny-Change-Big-Result Hook)
Opening: Tiny change producing disproportionate results
Middle: Why small adjustments work better than big overhauls
Close: The specific small change + how to make it + CTA

### B2. FUTURE SELF REGRET MINIMIZER (Future Reflection Hook)
Opening: Paint a picture of future regret for not acting
Middle: Show widening gap between acting now vs later
Close: Remove risk of action, amplify risk of inaction + CTA

### B3. INSIDER-OUTSIDER CONTRAST (Elite Practice Contrast Hook)
Opening: Contrast what elite practitioners do vs everyone else
Middle: Reveal practices that separate insiders from outsiders
Close: How to gain insider access + CTA

### B4. RESOURCE MAXIMIZER (Resource Constraint Hook)
Opening: Challenge "more resources = more results" assumption
Middle: Show how constraints produce better outcomes
Close: Maximize results with what you already have + CTA`;

/** Template metadata for UI display */
export const AD_TEMPLATE_META: {
  id: AdTemplate;
  name: string;
  hookType: string;
  bestFor: string;
}[] = [
  { id: "before_after", name: "Before & After", hookType: "Transformation Contrast", bestFor: "Showing dramatic change with proof" },
  { id: "insider_reveal", name: "Insider Reveal", hookType: "Exclusivity Curiosity", bestFor: "Hidden knowledge people don't know" },
  { id: "framework_intro", name: "Framework Introduction", hookType: "Complexity Contrast", bestFor: "Simplifying an overwhelming problem" },
  { id: "quick_win", name: "Quick Win", hookType: "Speed-Result Contrast", bestFor: "Fast results with minimal effort" },
  { id: "industry_authority", name: "Industry Authority", hookType: "Recognition Gap", bestFor: "Expert vs beginner contrast" },
  { id: "hidden_cost", name: "Hidden Cost", hookType: "Invisible Pain", bestFor: "Costs they didn't know they're paying" },
  { id: "identity_shift", name: "Identity Shift", hookType: "Identity Crisis", bestFor: "Challenging who they think they are" },
  { id: "pattern_interrupt", name: "Pattern Interrupt", hookType: "Perspective-Shattering", bestFor: "Questions that break assumptions" },
  { id: "overlooked_factor", name: "Overlooked Factor", hookType: "Missing Element", bestFor: "The one thing everyone misses" },
  { id: "bottleneck_breakthrough", name: "Bottleneck Breakthrough", hookType: "Bottleneck Revelation", bestFor: "Single constraint blocking all results" },
  { id: "effortless_pivot", name: "Effortless Pivot", hookType: "Tiny-Change-Big-Result", bestFor: "Small change, disproportionate impact" },
  { id: "future_regret", name: "Future Regret", hookType: "Future Reflection", bestFor: "Cost of not acting now" },
  { id: "insider_outsider", name: "Insider-Outsider", hookType: "Elite Practice Contrast", bestFor: "What the best do differently" },
  { id: "resource_maximizer", name: "Resource Maximizer", hookType: "Resource Constraint", bestFor: "Do more with less" },
];

/** Map template ID → display name for prompts */
const TEMPLATE_NAMES: Record<AdTemplate, string> = {
  before_after: "Before & After",
  insider_reveal: "Insider Reveal",
  framework_intro: "Framework Introduction",
  quick_win: "Quick Win",
  industry_authority: "Industry Authority",
  hidden_cost: "Hidden Cost",
  identity_shift: "Identity Shift",
  pattern_interrupt: "Pattern Interrupt Question",
  overlooked_factor: "Overlooked Factor",
  bottleneck_breakthrough: "Bottleneck Breakthrough",
  effortless_pivot: "Effortless Pivot",
  future_regret: "Future Self Regret Minimizer",
  insider_outsider: "Insider-Outsider Contrast",
  resource_maximizer: "Resource Maximizer",
};

// ---------------------------------------------------------------------------
// Hook inspiration from curated hook library
// ---------------------------------------------------------------------------

export async function buildHookInspiration(product: string): Promise<string> {
  const { createServerSupabase } = await import("@/lib/supabase");
  const db = createServerSupabase();

  const { data: hooks } = await db
    .from("hook_library")
    .select("hook_text, awareness_level, angle")
    .eq("status", "approved")
    .or(`product.eq.${product},product.is.null`)
    .order("created_at", { ascending: false })
    .limit(25);

  if (!hooks || hooks.length === 0) return "";

  const lines: string[] = [
    "\n---\n",
    "## PROVEN HOOKS — USE AS INSPIRATION (DO NOT COPY)",
    "These hooks have been curated from winning concepts. Study the TONE, PATTERN, and EMOTIONAL TRIGGERS — then create ORIGINAL hooks that are equally compelling but completely different in content.\n",
    "### Curated hooks:",
  ];

  hooks.slice(0, 25).forEach((h) => {
    const meta = [h.awareness_level, h.angle].filter(Boolean).join(" / ");
    lines.push(`- "${h.hook_text}"${meta ? ` (${meta})` : ""}`);
  });
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildProductContext(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string
): string {
  const parts: string[] = [];

  parts.push(`Product: ${product.name}`);
  if (product.tagline) parts.push(`Tagline: ${product.tagline}`);
  if (product.benefits?.length)
    parts.push(`Key Benefits:\n${product.benefits.map((b) => `- ${b}`).join("\n")}`);
  if (product.usps?.length)
    parts.push(`USPs:\n${product.usps.map((u) => `- ${u}`).join("\n")}`);
  if (product.claims?.length)
    parts.push(`Proof/Claims:\n${product.claims.map((c) => `- ${c}`).join("\n")}`);
  if (product.target_audience)
    parts.push(`Target Audience: ${product.target_audience}`);
  if (product.ingredients)
    parts.push(`Key Ingredients: ${product.ingredients}`);

  if (productBrief) {
    parts.push(`\n### Product Brief\n${productBrief}`);
  }

  const extraGuidelines = guidelines
    .filter((g) => g.name !== "Product Brief")
    .slice(0, 3)
    .map((g) => `### ${g.name}\n${g.content.slice(0, 1500)}`)
    .join("\n\n");
  if (extraGuidelines) {
    parts.push(`\n### Additional Guidelines\n${extraGuidelines}`);
  }

  if (segments.length > 0) {
    const segmentList = segments
      .map(
        (s) =>
          `- **${s.name}**: ${s.description ?? ""}${s.core_desire ? ` | Desire: ${s.core_desire}` : ""}${s.core_constraints ? ` | Constraints: ${s.core_constraints}` : ""}`
      )
      .join("\n");
    parts.push(`\n### Audience Segments\n${segmentList}`);
  }

  if (hookInspiration) {
    parts.push(hookInspiration);
  }

  return parts.join("\n\n");
}

const OUTPUT_INSTRUCTIONS = `## OUTPUT INSTRUCTIONS

Generate concept proposals as a JSON object with a "proposals" array. Each proposal MUST have:

{
  "proposals": [
    {
      "concept_name": "Short memorable name (2-5 words)",
      "concept_description": "2-3 sentences describing the core idea and why it would work",
      "cash_dna": {
        "concept_type": "avatar_facts | market_facts | product_facts | psychology_toolkit",
        "angle": "one of the 20 angles — MUST be DIFFERENT for each proposal",
        "style": "one of the 11 styles",
        "hooks": ["3-5 hook line variations — the opening line the viewer sees first"],
        "awareness_level": "Unaware | Problem Aware | Solution Aware | Product Aware | Most Aware",
        "ad_source": "<will be specified per mode>",
        "copy_blocks": ["array of blocks used: Pain, Promise, Proof, Curiosity, Constraints, Conditions — specify depth level where relevant (e.g. 'Pain: Cinematic + Core Wound', 'Proof: Experiential + Social', 'Curiosity: Characterization')"],
        "concept_description": "same as outer concept_description"
      },
      "ad_copy_primary": ["2-3 primary ad text variations (English, 100-200 words each)"],
      "ad_copy_headline": ["2-3 headline variations (English, max 40 chars each)"],
      "visual_direction": "What the static ad image should look like — layout, imagery, mood, text overlay approach",
      "differentiation_note": "What makes this concept unique / how it differs from other proposals",
      "suggested_tags": ["2-4 relevant tags"]
    }
  ]
}

CRITICAL RULES:
- Each proposal MUST use a DIFFERENT angle
- Write ad copy in ENGLISH (it will be translated later)
- NEVER invent medical claims — only use claims from the product brief
- Hooks should be scroll-stopping — curiosity, pattern interrupts, or strong emotional triggers
- Primary text should be ready-to-use ad copy, not placeholder text. Apply Copy Blocks techniques: use Pain Chain levels, Proof Braid (pair claims with proof), strong Curiosity characterizations, and C.R.A.V.E.S. to strengthen every block
- Visual direction should be specific enough to brief a designer
- Return ONLY valid JSON, no markdown fences, no explanation text
- ORIGINALITY: All examples in this prompt are TEACHING EXAMPLES showing patterns, NOT content to reuse. Create completely original concepts with unique references, facts, and cultural touchpoints specific to the product. Never recycle framework examples.`;

// ---------------------------------------------------------------------------
// System prompts per mode
// ---------------------------------------------------------------------------

function buildFromScratchSystem(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string
): string {
  const productContext = buildProductContext(product, productBrief, guidelines, segments, hookInspiration);

  return `You are a senior direct-response creative strategist specializing in health & wellness ecommerce for Scandinavian markets (Sweden, Norway, Denmark). You generate original ad concept ideas from first principles — product knowledge, audience psychology, and proven creative frameworks.

You understand the psychology of health-conscious Scandinavian consumers — Jantelagen (never brag or overclaim), peer social proof matters more than celebrity endorsement, and understatement beats hype.

${CASH_FRAMEWORK}

${COPY_BLOCKS_DEEP}

${STORMING_SOURCES}

${AVATAR_FACTS_FRAMEWORK}

${HEADLINE_FORMULAS}

---

## PRODUCT KNOWLEDGE

${productContext}

---

${OUTPUT_INSTRUCTIONS.replace("<will be specified per mode>", "Wildcard")}`;
}

function buildFromOrganicSystem(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string
): string {
  const productContext = buildProductContext(product, productBrief, guidelines, segments, hookInspiration);

  return `You are a senior direct-response creative strategist specializing in health & wellness ecommerce for Scandinavian markets. You specialize in adapting organic content — viral posts, articles, Reddit threads, comments — into paid ad concepts.

The key insight: Organic creators are often better at hooks than most paid copywriters. The feedback loop is so sharp and fast that only the best hooks survive. Your job is to identify what makes the organic content work and adapt that energy into ad concepts.

${CASH_FRAMEWORK}

${COPY_BLOCKS_DEEP}

---

## PRODUCT KNOWLEDGE

${productContext}

---

## ORGANIC ADAPTATION PROCESS

1. Identify the CORE INSIGHT — what makes this content resonate? What emotion/truth/curiosity does it tap?
2. Extract the HOOK PATTERN — what structural element creates the scroll-stop? (unexpected claim, emotional revelation, curiosity gap, identity statement)
3. Map to CASH — which concept type, angle, and awareness level does this naturally fit?
4. Adapt for our product — how can we use this same insight/energy for our specific product and audience?
5. Create NEW hooks inspired by the original — don't copy, transform.

${OUTPUT_INSTRUCTIONS.replace("<will be specified per mode>", "Organic")}`;
}

function buildFromResearchSystem(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string
): string {
  const productContext = buildProductContext(product, productBrief, guidelines, segments, hookInspiration);

  return `You are a senior direct-response creative strategist specializing in health & wellness ecommerce for Scandinavian markets. You specialize in turning research findings, statistics, studies, and customer comments into compelling ad concepts.

Where there's friction, there's attention. Research, studies, and comments are goldmines for ad concepts because they contain real-world validation of pains, desires, and beliefs.

${CASH_FRAMEWORK}

${COPY_BLOCKS_DEEP}

---

## PRODUCT KNOWLEDGE

${productContext}

---

## RESEARCH-TO-AD PROCESS

1. Extract the HEADLINE STAT — what's the single most surprising or compelling finding?
2. Identify the EMOTIONAL HOOK — what fear, desire, or curiosity does this data trigger?
3. Build the BELIEF CHAIN — how does this research validate the problem → create urgency → point to our solution?
4. Create concepts that use the research as PROOF — the research becomes the authority element in the ad
5. Vary approaches: some concepts lead with the stat, others use it as mid-copy proof, others build a narrative around it

Prioritize concept types: product_facts and market_facts work best with research-backed concepts.

${OUTPUT_INSTRUCTIONS.replace("<will be specified per mode>", "Research")}`;
}

function buildFromInternalSystem(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string
): string {
  const productContext = buildProductContext(product, productBrief, guidelines, segments, hookInspiration);

  return `You are a senior direct-response creative strategist specializing in health & wellness ecommerce for Scandinavian markets. You specialize in creative coverage analysis — finding gaps in existing ad portfolios and filling them with fresh concepts.

The Matrix/Coverage approach: instead of the sniper approach where you pick your best ideas, you carpet bomb. Systematically go through every angle, every concept type, every awareness level and find what's MISSING.

${CASH_FRAMEWORK}

${COPY_BLOCKS_DEEP}

---

## PRODUCT KNOWLEDGE

${productContext}

---

## COVERAGE GAP ANALYSIS PROCESS

1. Review the existing concepts provided (angles, awareness levels, concept types used)
2. Identify GAPS:
   - Which angles have NEVER been tested? These are highest priority.
   - Which awareness levels are underserved? (Unaware concepts are often missing and scale hardest)
   - Which concept types are overrepresented vs underrepresented?
   - Are there segments that have no concepts targeted at them?
3. Generate proposals that specifically FILL these gaps
4. Each proposal should reference which gap it fills in its differentiation_note
5. Prioritize: untested angles > underserved awareness levels > underrepresented concept types

${OUTPUT_INSTRUCTIONS.replace("<will be specified per mode>", "Matrix/Coverage")}`;
}

function buildUnawareSystem(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string
): string {
  const productContext = buildProductContext(product, productBrief, guidelines, segments, hookInspiration);

  return `You are a senior direct-response creative strategist specializing in UNAWARE ads — the hardest but highest-scaling ad type. You create ads that grab people who aren't looking for a solution and make them feel a gap they didn't know existed.

These ads read like content, not ads. They are aggressive with their disguise and belief shifting. They open up the market by pulling from the biggest possible emotional pools instead of fishing for the small group already searching.

IMPORTANT: All concepts you generate MUST target the "Unaware" awareness level.

${CASH_FRAMEWORK}

${COPY_BLOCKS_DEEP}

${UNAWARE_AD_TYPES}

${NATIVE_AD_PSYCHOLOGY}

---

## PRODUCT KNOWLEDGE

${productContext}

---

## VISUAL DIRECTION FOR UNAWARE/NATIVE ADS

For unaware ads, visual direction should prioritize NATIVE-LOOKING imagery:
- Medical illustrations, anatomical cross-sections, microscope close-ups
- Uncomfortable close-ups, messy real-life scenes, cluttered environments
- Editorial-style photography that looks like it belongs in a news article
- AVOID polished product shots, lifestyle glamour, anything that "looks like an ad"
- Images should create a curiosity gap and trigger involuntary attention

Visual direction MUST specify which of the 3 native image types to use:
1. native-medical — anatomical diagrams, medical illustrations, cellular close-ups
2. native-closeup — raw skin textures, swollen joints, uncomfortable body close-ups
3. native-messy — cluttered medicine cabinets, messy bedside tables, real-life bathroom shelves

${HEADLINE_FORMULAS}

Generate editorial-style native_headlines using these formulas. They should read like news article titles, NOT ad headlines.

${OUTPUT_INSTRUCTIONS.replace("<will be specified per mode>", "Wildcard").replace(
  '"awareness_level": "Unaware | Problem Aware | Solution Aware | Product Aware | Most Aware"',
  '"awareness_level": "Unaware"'
).replace(
  '"ad_copy_headline": ["2-3 headline variations (English, max 40 chars each)"],',
  '"ad_copy_headline": ["2-3 headline variations (English, max 40 chars each)"],\n      "native_headlines": ["3-5 editorial-style headlines using the native formulas above — these read like news article titles, NOT ad headlines"],'
)}

CRITICAL — ORIGINALITY RULES:
- NEVER reuse or closely adapt any example from this prompt. The examples above (Rockefeller, Okinawans, chiropractors, "3am", "mitochondria", dog eating grass, etc.) are TEACHING EXAMPLES ONLY — they show the PATTERN, not the content. You MUST create completely original concepts using different references, facts, and cultural touchpoints.
- Each concept must use a reference or hook that is SPECIFIC TO THE PRODUCT and its domain — not a generic health/wellness trope.
- If you catch yourself writing about Rockefeller, Okinawa, "3am", or any example from the framework above, STOP and think of something original.
- Draw from the product brief and audience segments for inspiration — what are THEIR specific pains, beliefs, and cultural context?

ADDITIONAL RULES FOR UNAWARE CONCEPTS:
- Each proposal must specify which unaware ad type it uses (Straddle, Symptom, Worldview Porn, or Story)
- Include the unaware type in suggested_tags (e.g., ["unaware", "straddle", "native"])
- Hooks must NOT mention the product name — lead with curiosity or emotional energy
- Visual direction should describe native/editorial-style imagery and specify which native image type (native-medical, native-closeup, or native-messy) fits best
- native_headlines MUST use the editorial formulas above — they will be overlaid on native-style images
- Destination should be implied as advertorial/educational content, not direct product page`;
}

function buildFromTemplateSystem(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string
): string {
  const productContext = buildProductContext(product, productBrief, guidelines, segments, hookInspiration);

  return `You are a senior direct-response creative strategist specializing in health & wellness ecommerce for Scandinavian markets. You specialize in template-based ad creation — using proven 3-part ad structures (Opening → Middle → Close) to generate high-converting ad concepts.

Each template has a specific hook type and psychological flow that has been battle-tested across thousands of ads. Your job is to follow the template structure faithfully while making the content original and specific to the product.

${CASH_FRAMEWORK}

${COPY_BLOCKS_DEEP}

${AD_TEMPLATES}

---

## PRODUCT KNOWLEDGE

${productContext}

---

## TEMPLATE-BASED GENERATION RULES

1. Each ad_copy_primary MUST follow the selected template's 3-part structure (Opening → Middle → Close)
2. The template name MUST appear in suggested_tags (e.g. ["template:before_after", ...])
3. The hook type from the template should inform the hooks — but make them original and product-specific
4. Apply Copy Blocks techniques within the template structure: Pain Chain, Promise Ladder, Proof Braid, Curiosity characterizations
5. Visual direction should complement the template's emotional arc

${OUTPUT_INSTRUCTIONS.replace("<will be specified per mode>", "Templates")}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const SYSTEM_BUILDERS: Record<
  BrainstormMode,
  (
    product: ProductFull,
    brief: string | undefined,
    guidelines: CopywritingGuideline[],
    segments: ProductSegment[],
    hookInspiration?: string
  ) => string
> = {
  from_scratch: buildFromScratchSystem,
  from_organic: buildFromOrganicSystem,
  from_research: buildFromResearchSystem,
  from_internal: buildFromInternalSystem,
  unaware: buildUnawareSystem,
  from_template: buildFromTemplateSystem,
};

/**
 * Build the system prompt for a brainstorm mode.
 */
export function buildBrainstormSystemPrompt(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  mode: BrainstormMode,
  hookInspiration?: string
): string {
  const builder = SYSTEM_BUILDERS[mode];
  return builder(product, productBrief, guidelines, segments, hookInspiration);
}

/**
 * Build the user prompt based on mode-specific inputs.
 */
export function buildBrainstormUserPrompt(
  request: BrainstormRequest,
  segments: ProductSegment[],
  existingConcepts?: Array<{ name: string; angle: string; awareness: string }>,
  rejectedConcepts?: Array<{ angle: string | null; awareness_level: string | null; concept_description: string | null }>
): string {
  const parts: string[] = [];
  const { mode, count } = request;

  // Mode-specific context
  switch (mode) {
    case "from_scratch": {
      parts.push("## BRAINSTORM: FROM SCRATCH");
      parts.push(
        "Generate original ad concepts from first principles. Use the product knowledge, audience segments, and creative frameworks to create fresh concepts that haven't been done before."
      );
      if (request.segment_id) {
        const segment = segments.find((s) => s.id === request.segment_id);
        if (segment) {
          parts.push(`\n**Focus segment:** ${segment.name}`);
          if (segment.description) parts.push(`Description: ${segment.description}`);
          if (segment.core_desire) parts.push(`Core desire: ${segment.core_desire}`);
          if (segment.core_constraints) parts.push(`Core constraints: ${segment.core_constraints}`);
        }
      }
      break;
    }

    case "from_organic": {
      parts.push("## BRAINSTORM: FROM ORGANIC CONTENT");
      parts.push(
        "Analyze the organic content below. Identify what makes it resonate, extract the hook pattern and core insight, then adapt it into ad concepts for our product."
      );
      if (request.organic_text) {
        parts.push(`\n### ORGANIC CONTENT\n${request.organic_text.slice(0, 5000)}`);
      }
      break;
    }

    case "from_research": {
      parts.push("## BRAINSTORM: FROM RESEARCH");
      parts.push(
        "Use the research/data below to build compelling ad concepts. Extract the most surprising findings and turn them into hooks, proof points, and belief chains."
      );
      if (request.research_text) {
        parts.push(`\n### RESEARCH/DATA\n${request.research_text.slice(0, 5000)}`);
      }
      break;
    }

    case "from_internal": {
      parts.push("## BRAINSTORM: COVERAGE GAP ANALYSIS");
      parts.push(
        "Review the existing concepts below and generate proposals that fill the gaps — untested angles, underserved awareness levels, and underrepresented concept types."
      );
      if (existingConcepts && existingConcepts.length > 0) {
        parts.push("\n### EXISTING CONCEPTS (already created)");
        const conceptList = existingConcepts
          .map((c) => `- ${c.name} | Angle: ${c.angle} | Awareness: ${c.awareness}`)
          .join("\n");
        parts.push(conceptList);

        // Summarize coverage
        const angles = new Set(existingConcepts.map((c) => c.angle));
        const awarenessLevels = new Set(existingConcepts.map((c) => c.awareness));
        parts.push(`\n**Angles already used:** ${[...angles].join(", ")}`);
        parts.push(`**Awareness levels covered:** ${[...awarenessLevels].join(", ")}`);
        parts.push(
          `**Total concepts:** ${existingConcepts.length}\n\nFill the gaps! Prioritize angles and awareness levels NOT in the list above.`
        );
      } else {
        parts.push(
          "\nNo existing concepts found — you have a blank canvas! Start with a diverse mix of angles and awareness levels."
        );
      }
      break;
    }

    case "unaware": {
      parts.push("## BRAINSTORM: UNAWARE ADS");
      parts.push(
        "Generate unaware ad concepts using the 4 unaware ad types. These ads must NOT look or feel like ads. They should read like fascinating content that creates a gap the reader needs to close."
      );
      if (request.unaware_types && request.unaware_types.length > 0) {
        const typeLabels: Record<string, string> = {
          straddle: "Straddle (Curiosity + Relevance)",
          symptom: "Symptom (Reference + Reframe)",
          worldview_porn: "Worldview Porn (Emotional Reservoir → Product)",
          story: "Story (P.I.G. Openings)",
        };
        const types = request.unaware_types
          .map((t) => typeLabels[t] ?? t)
          .join(", ");
        parts.push(`\n**Focus on these unaware types:** ${types}`);
        parts.push(
          `Generate at least one concept per requested type.`
        );
      } else {
        parts.push(
          "\nUse a mix of all 4 unaware types across your proposals."
        );
      }
      break;
    }

    case "from_template": {
      parts.push("## BRAINSTORM: FROM TEMPLATE");
      if (request.template_ids && request.template_ids.length > 0) {
        const names = request.template_ids.map((id) => TEMPLATE_NAMES[id]).join(", ");
        parts.push(
          `Use these specific ad templates: **${names}**`
        );
        if (request.template_ids.length > 1) {
          parts.push(
            `Generate one concept per template (up to ${count} total). Each ad_copy_primary MUST follow that template's 3-part structure.`
          );
        } else {
          parts.push(
            `Generate ${count} different concept variations using the ${TEMPLATE_NAMES[request.template_ids[0]]} template. Same structure, different angles and product insights.`
          );
        }
      } else {
        parts.push(
          `Choose the ${count} most effective templates for this product and generate one concept per template. Each ad_copy_primary MUST follow the chosen template's 3-part structure.`
        );
      }
      parts.push(
        `\nInclude the template name in suggested_tags as "template:<template_id>" (e.g. "template:before_after").`
      );
      if (request.segment_id) {
        const segment = segments.find((s) => s.id === request.segment_id);
        if (segment) {
          parts.push(`\n**Focus segment:** ${segment.name}`);
          if (segment.description) parts.push(`Description: ${segment.description}`);
          if (segment.core_desire) parts.push(`Core desire: ${segment.core_desire}`);
          if (segment.core_constraints) parts.push(`Core constraints: ${segment.core_constraints}`);
        }
      }
      break;
    }
  }

  // Optional focus parameters
  if (request.focus_angles && request.focus_angles.length > 0) {
    parts.push(`\n**Preferred angles:** ${request.focus_angles.join(", ")}`);
  }
  if (request.focus_awareness) {
    parts.push(`**Target awareness level:** ${request.focus_awareness}`);
  }

  // Rejected concepts — avoid similar ideas
  if (rejectedConcepts && rejectedConcepts.length > 0) {
    parts.push(`\n### REJECTED CONCEPTS (avoid similar ideas — the user explicitly disliked these)`);
    for (const rc of rejectedConcepts) {
      const desc = [
        rc.angle ? `Angle: ${rc.angle}` : null,
        rc.awareness_level ? `Awareness: ${rc.awareness_level}` : null,
        rc.concept_description ? `"${rc.concept_description}"` : null,
      ].filter(Boolean).join(", ");
      parts.push(`- ${desc}`);
    }
    parts.push("Do NOT generate concepts with similar angles, themes, or approaches to the rejected ones above.");
  }

  parts.push(
    `\nGenerate ${count} concept proposals. Each MUST use a DIFFERENT angle. Make them genuinely diverse — different concept types, different emotional approaches, different visual styles.`
  );

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Mode metadata for UI
// ---------------------------------------------------------------------------

export const BRAINSTORM_MODES: {
  value: BrainstormMode;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    value: "from_scratch",
    label: "From Scratch",
    description: "Generate original concepts from product knowledge and creative frameworks",
    icon: "Sparkles",
  },
  {
    value: "from_organic",
    label: "From Organic",
    description: "Adapt viral organic content (posts, articles, threads) into ad concepts",
    icon: "Leaf",
  },
  {
    value: "from_research",
    label: "From Research",
    description: "Turn research findings, statistics, and studies into ad concepts",
    icon: "BookOpen",
  },
  {
    value: "from_internal",
    label: "Coverage Gaps",
    description: "Analyze existing concepts and fill creative coverage gaps",
    icon: "Grid3X3",
  },
  {
    value: "unaware",
    label: "Unaware Ads",
    description: "Create native-style ads that don't look like ads — for advertorial traffic",
    icon: "Eye",
  },
  {
    value: "from_template",
    label: "From Template",
    description: "Use proven 3-part ad structures from the Copy Blocks system",
    icon: "LayoutTemplate",
  },
];
