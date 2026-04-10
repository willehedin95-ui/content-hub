import Anthropic from "@anthropic-ai/sdk";
import type {
  ProductFull,
  CopywritingGuideline,
  ProductSegment,
  BrainstormMode,
  BrainstormRequest,
  AdTemplate,
  Angle,
  AwarenessLevel,
  IterationType,
  CashDna,
  NarrativeArchetype,
} from "@/types";
import { CLAUDE_MODEL, USE_JSON_PROMPTING } from "./constants";
import { LANGUAGES } from "@/types";

/** Resolve a language code to a human-readable label (e.g. "sv" -> "Swedish"). */
function langLabel(code: string): string {
  if (code === "en") return "English";
  return LANGUAGES.find((l) => l.value === code)?.label ?? code;
}
import { parseConceptProposals } from "./concept-generator";
import { getProductAppearance } from "./product-appearance";

// Re-export for convenience
export { parseConceptProposals };
export { sanitizePrices, containsPrice, stripPricesFromString } from "./price-sanitizer";
import { sanitizePrices } from "./price-sanitizer";

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
// Narrative archetypes for story-driven native ad copy
// ---------------------------------------------------------------------------

const NARRATIVE_ARCHETYPES = `## NARRATIVE ARCHETYPES — Story-Driven Copy Frameworks

These are 4 proven story structures for long-form native ads. Each creates a different psychological entry point. The ad copy should read like a personal Facebook post or blog article — NOT like ad copy. 40+ audiences read long copy. Don't be afraid of it.

CORE RULES FOR ALL ARCHETYPES:
- The opening line is everything. Write it like the reader typed it themselves.
- Never mention the product in the first 150+ words. Lead with the human, not the product.
- The product should feel like the next logical step in the story, not the point of it.
- Use a fictional character (doctor, friend, spouse) to deliver science/claims — the narrator never makes claims directly.
- Sensory details ("random Tuesday in October", "burgundy scarf", "shaking hands") make it feel like memory, not marketing.
- Polish kills trust. Real moments, real people, real scenes.
- Close with a reason to care, not a reason to buy.

### ARCHETYPE 1: THE CONFESSION (Personal Shame → Discovery → Resolution)
Psychology: Stories bypass the part of the brain that evaluates and resists. Once emotionally invested in a character, rejecting the product feels like abandoning them.

Structure:
1. Open with a deeply personal confession — a moment of shame, vulnerability, or crisis. Put the reader in the scene.
2. Voice the thing they secretly blame themselves for. Say it out loud for them before they have to admit it.
3. List everything they tried that failed. Be exhaustive — the longer this list, the more seen they feel.
4. The unexpected discovery. A person, a conversation, a turning point that changes everything.
5. The explanation (delivered by a fictional expert character). Why nothing worked before. This is where you earn trust.
6. The product enters naturally — just the next step in the story, not forced.
7. Week by week results. Specific numbers, not vague claims.
8. Close with a reason to care, not a reason to buy.

Hook style: Raw first-person confession that voices the reader's own shame before they have to admit it.
Example tone: "My husband came out as gay after 26 years of marriage and it nearly killed me. Literally."

### ARCHETYPE 2: THE RAGE (Systemic Injustice → Validation → Reclaiming Control)
Psychology: When an ad says what the reader has been feeling but never said out loud, trust is instant. Reframing the problem as systemic failure removes self-blame and makes them ready to act.

Structure:
1. Open with the reader's exact words — write it like they would type it into a search bar or a Facebook group at 2am. Raw, specific, zero polish.
2. The comparison that makes the unfairness undeniable. Their situation vs someone who got treated better. Use real numbers.
3. The list of everything they did right. Show they are NOT the problem.
4. The one question nobody ever asked them — this is your pivot to the solution.
5. The explanation of WHY. Science delivered through a trusted character, not a brand voice.
6. The product as the first thing that addresses the real cause, not just symptoms.
7. A relationship detail showing what the problem costs beyond the physical pain.
8. Close with solidarity, not a pitch.

Hook style: Raw frustration that reads like a 2am Facebook group rant. The first line should stop the scroll because it voices suppressed anger.
Example tone: "I have had 12 UTIs in 18 months. My husband gets his first one in 20 years. He walks out with specialist referrals. I get told to drink cranberry juice."

### ARCHETYPE 3: THE DOUBLE STANDARD (Unfair Comparison → Gaslight List → Permission)
Psychology: When someone sees their problem is being ignored while an equivalent one gets full attention, shame turns into clarity. That shift from self-blame to clarity is what makes them ready to act.

Structure:
1. Open with a comparison that shows how differently the reader's problem is treated vs an equivalent one. Make it specific and a little provocative.
2. The contrast that exposes the gap. Real numbers, real situations.
3. The gaslight list — every dismissive thing they have been told. Write it in THEIR voice, not yours. Each line should be something the reader has personally heard.
4. One real data point that validates everything they suspected. Just one — it gives the whole story credibility without feeling like a lecture.
5. The expert who finally gets it. Deliver the science through them.
6. The product as an act of reclaiming something that was taken from them.
7. Close with permission. Tell them they do not have to accept this.

Hook style: A provocative comparison that makes systemic unfairness undeniable. Uses specific contrasts with real numbers.
Example tone: "He mentioned ED once. Walked out with a prescription. I spent 18 months with four doctors and got told to have a glass of wine."

### ARCHETYPE 4: THE WITNESS (Observer Perspective → Shared Risk → Protection)
Psychology: Fear for someone you love converts faster than fear for yourself. Perspective shifts capture people who would never have self-identified as the target audience.

Structure:
1. Open with a scene, not a symptom. Tension first, context second. Write it like a thriller opening.
2. Tell the story from the observer's perspective — someone watching a person they love go through something.
3. Sensory details that make the scene feel lived in. What they saw, heard, felt.
4. The reveal delivered to the observer, not the patient. They are learning alongside the reader.
5. The moment the observer realises THEY are also at risk. This expands your audience without changing the product.
6. The product ordered for a loved one that turns out to be needed by both.
7. Results for two people, not one.
8. Close with the fear of a phone call they never want to receive.

Hook style: A scene that reads like a thriller opening. Told from the spouse's or loved one's perspective.
Example tone: "The phone rang at 6am. A voice I didn't recognize told me my husband had collapsed at the gym."

### CHOOSING AN ARCHETYPE
- THE CONFESSION works best when your audience carries private shame about their problem (weight, sleep, sexual health, aging)
- THE RAGE works best when the system has failed them (medical gaslighting, double standards in treatment)
- THE DOUBLE STANDARD works best when there's an obvious comparison where their problem gets less attention than an equivalent one
- THE WITNESS works best when you want to capture BOTH the sufferer AND their partner/family as audience`;

/** Narrative archetype metadata for UI display */
export const NARRATIVE_ARCHETYPE_META: {
  id: NarrativeArchetype;
  name: string;
  psychology: string;
  bestFor: string;
}[] = [
  { id: "confession", name: "The Confession", psychology: "Shame → vulnerability → trust", bestFor: "Problems people feel privately ashamed about" },
  { id: "rage", name: "The Rage", psychology: "Suppressed anger → validation → action", bestFor: "When the system has failed the reader" },
  { id: "double_standard", name: "The Double Standard", psychology: "Unfairness → clarity → permission", bestFor: "Problems that get dismissed while others get attention" },
  { id: "witness", name: "The Witness", psychology: "Fear for loved one → shared risk", bestFor: "Capturing both sufferer AND their partner as audience" },
];

// ---------------------------------------------------------------------------
// Hook inspiration from curated hook library
// ---------------------------------------------------------------------------

export async function buildHookInspiration(product: string, workspaceId: string): Promise<string> {
  const { createServerSupabase } = await import("@/lib/supabase-admin");
  const db = createServerSupabase();
  const wsId = workspaceId;

  const { data: hooks } = await db
    .from("hook_library")
    .select("hook_text, awareness_level, angle")
    .eq("workspace_id", wsId)
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

/**
 * Build learnings context from past concept outcomes for brainstorm prompt injection.
 */
export async function buildLearningsContext(product: string, workspaceId: string): Promise<string> {
  const { createServerSupabase } = await import("@/lib/supabase-admin");
  const db = createServerSupabase();
  const wsId = workspaceId;

  const { data: learnings } = await db
    .from("concept_learnings")
    .select("*")
    .eq("workspace_id", wsId)
    .eq("product", product)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!learnings || learnings.length === 0) return "";

  const lines: string[] = [
    "\n---\n",
    "## LEARNINGS FROM PAST AD TESTS",
    "Use these learnings to inform your concept generation. Avoid repeating approaches that have consistently failed. Lean into patterns that have worked.\n",
  ];

  // Aggregate patterns by angle
  const angleStats = new Map<string, { wins: number; losses: number; avgRoas: number; roasCount: number }>();
  const awarenessStats = new Map<string, { wins: number; losses: number }>();
  const styleStats = new Map<string, { wins: number; losses: number }>();

  for (const l of learnings) {
    if (l.angle) {
      const s = angleStats.get(l.angle) ?? { wins: 0, losses: 0, avgRoas: 0, roasCount: 0 };
      if (l.outcome === "winner") {
        s.wins++;
        if (l.roas) { s.avgRoas += l.roas; s.roasCount++; }
      } else {
        s.losses++;
      }
      angleStats.set(l.angle, s);
    }
    if (l.awareness_level) {
      const s = awarenessStats.get(l.awareness_level) ?? { wins: 0, losses: 0 };
      l.outcome === "winner" ? s.wins++ : s.losses++;
      awarenessStats.set(l.awareness_level, s);
    }
    if (l.style) {
      const s = styleStats.get(l.style) ?? { wins: 0, losses: 0 };
      l.outcome === "winner" ? s.wins++ : s.losses++;
      styleStats.set(l.style, s);
    }
  }

  // What works (win rate > 50% with 2+ tests)
  const winners: string[] = [];
  for (const [angle, s] of angleStats) {
    const total = s.wins + s.losses;
    if (total >= 2 && s.wins / total > 0.5) {
      const roasStr = s.roasCount > 0 ? ` (avg ROAS ${(s.avgRoas / s.roasCount).toFixed(1)}x)` : "";
      winners.push(`- **${angle}** angle: ${s.wins}/${total} won${roasStr}`);
    }
  }
  for (const [awareness, s] of awarenessStats) {
    const total = s.wins + s.losses;
    if (total >= 2 && s.wins / total > 0.5) {
      winners.push(`- **${awareness}** awareness: ${s.wins}/${total} won`);
    }
  }

  if (winners.length > 0) {
    lines.push("### What Works");
    lines.push(...winners);
    lines.push("");
  }

  // What doesn't work (win rate < 30% with 2+ tests)
  const losers: string[] = [];
  for (const [angle, s] of angleStats) {
    const total = s.wins + s.losses;
    if (total >= 2 && s.wins / total < 0.3) {
      losers.push(`- **${angle}** angle: ${s.wins}/${total} won — avoid or try different execution`);
    }
  }
  for (const [awareness, s] of awarenessStats) {
    const total = s.wins + s.losses;
    if (total >= 2 && s.wins / total < 0.3) {
      losers.push(`- **${awareness}** awareness: ${s.wins}/${total} won`);
    }
  }

  if (losers.length > 0) {
    lines.push("### What Doesn't Work");
    lines.push(...losers);
    lines.push("");
  }

  // Recent takeaways (last 5 with non-empty takeaways)
  const recentWithTakeaways = learnings.filter((l: { takeaway: string | null }) => l.takeaway).slice(0, 5);
  if (recentWithTakeaways.length > 0) {
    lines.push("### Recent Takeaways");
    for (const l of recentWithTakeaways) {
      const badge = l.outcome === "winner" ? "WON" : "LOST";
      lines.push(`- "${l.concept_name}" (${l.market}, ${badge}): ${l.takeaway}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

export function buildProductContext(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string,
  learningsContext?: string,
  researchContext?: string
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

  const physicalAppearance = getProductAppearance(product);
  if (physicalAppearance) {
    parts.push(`\n### PRODUCT PHYSICAL APPEARANCE (critical for image prompts)\n${physicalAppearance}\n\nWhen describing OUR product in any image prompt, use ONLY these physical details. NEVER invent color, material, shape, or size. If the competitor's product looks different, IGNORE their product — we are only reproducing their visual FORMAT, not their product.`);
  }

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

  if (learningsContext) {
    parts.push(learningsContext);
  }

  if (hookInspiration) {
    parts.push(hookInspiration);
  }

  if (researchContext) {
    parts.push(researchContext);
  }

  return parts.join("\n\n");
}

function getOutputInstructions(generationLanguage = "en"): string {
  const gl = langLabel(generationLanguage);
  const glUpper = gl.toUpperCase();
  const translationNote = generationLanguage === "en"
    ? " (it will be translated later)"
    : " (it will be translated to other markets later)";

  return `## OUTPUT INSTRUCTIONS

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
      "ad_copy_primary": ["1 primary ad text (${gl}, 100-200 words). Use SHORT PARAGRAPHS with line breaks between each thought — one sentence or idea per paragraph. Never write a wall of text."],
      "ad_copy_headline": ["2 headline variations (${gl}, max 40 chars each)"],
      "visual_direction": "What the static ad image should look like — layout, imagery, mood, text overlay approach",
      "differentiation_note": "What makes this concept unique / how it differs from other proposals",
      "suggested_tags": ["2-4 relevant tags"]
    }
  ]
}

CRITICAL RULES:
- Each proposal MUST use a DIFFERENT angle
- Write ad copy in ${glUpper}${translationNote}
- NEVER invent medical claims — only use claims from the product brief
- Hooks should be scroll-stopping — curiosity, pattern interrupts, or strong emotional triggers
- Primary text should be ready-to-use ad copy, not placeholder text. Apply Copy Blocks techniques: use Pain Chain levels, Proof Braid (pair claims with proof), strong Curiosity characterizations, and C.R.A.V.E.S. to strengthen every block
- FORMAT: Use short paragraphs separated by blank lines (\\n\\n). One sentence or thought per paragraph. This creates readable, scroll-friendly ad copy. Never write dense wall-of-text paragraphs.
- Visual direction should be specific enough to brief a designer
- Return ONLY valid JSON, no markdown fences, no explanation text
- ORIGINALITY: All examples in this prompt are TEACHING EXAMPLES showing patterns, NOT content to reuse. Create completely original concepts with unique references, facts, and cultural touchpoints specific to the product. Never recycle framework examples.
- NO URLS IN AD COPY: Never include website URLs, link placeholders like [LINK], [LÄNK], [URL], or domain names in the ad copy text. The landing page URL is attached separately by the ad platform — it is NOT part of the ad copy. If the competitor's ad copy contains their website URL (e.g. "Free shipping 👉 shop.competitor.com"), adapt it to a natural call-to-action WITHOUT any URL (e.g. "Free shipping 👉 Shop now"). The viewer clicks anywhere on the ad to reach the landing page.
- NO PRICES ANYWHERE: Never invent or include prices, currency amounts, or money symbols (€, $, £, kr, SEK, NOK, DKK, EUR, USD) in ANY field of your output. This includes ad_copy_primary, ad_copy_headline, AND cash_dna.hooks, cash_dna.concept_description, visual_direction, and every image_prompt. The reason: cash_dna.hooks is used downstream to write overlay text for generated images, and visual_direction is used to brief Nano Banana. If a price leaks into a hook it ends up baked into the image overlay, which (a) dates the ad, (b) breaks on promotions, and (c) cannot be translated safely (we've had "€80 serum" baked into real images). Pricing belongs on the landing page only. The ONLY exception: if you are adapting a competitor ad whose copy explicitly mentions a price as a critical part of its hook (e.g. "I spent X on Y"), you may keep that price ONLY IF you convert it to Swedish kronor (SEK) — never EUR, USD, GBP, or any other foreign currency. Default behaviour: write the entire concept with no prices at all, in ANY field.${generationLanguage !== "en" ? `\n- IMAGE PROMPTS (Nano Banana) must ALWAYS be written in English regardless of ad copy language. Only ad_copy_primary, ad_copy_headline, and cash_dna.hooks should be in ${gl}.` : ""}`;
}

// ---------------------------------------------------------------------------
// System prompts per mode
// ---------------------------------------------------------------------------

function buildFromScratchSystem(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string,
  learningsContext?: string,
  researchContext?: string,
  generationLanguage?: string
): string {
  const productContext = buildProductContext(product, productBrief, guidelines, segments, hookInspiration, learningsContext, researchContext);

  return `You are a senior direct-response creative strategist specializing in health & wellness ecommerce for Scandinavian markets (Sweden, Norway, Denmark). You generate original ad concept ideas from first principles — product knowledge, audience psychology, and proven creative frameworks.

You understand the psychology of health-conscious Scandinavian consumers — Jantelagen (never brag or overclaim), peer social proof matters more than celebrity endorsement, and understatement beats hype.

${CASH_FRAMEWORK}

${COPY_BLOCKS_DEEP}

${STORMING_SOURCES}

${AVATAR_FACTS_FRAMEWORK}

${HEADLINE_FORMULAS}

${NARRATIVE_ARCHETYPES}

---

## PRODUCT KNOWLEDGE

${productContext}

---

${getOutputInstructions(generationLanguage).replace("<will be specified per mode>", "Wildcard")}`;
}

function buildFromOrganicSystem(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string,
  learningsContext?: string,
  researchContext?: string,
  generationLanguage?: string
): string {
  const productContext = buildProductContext(product, productBrief, guidelines, segments, hookInspiration, learningsContext, researchContext);

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

${getOutputInstructions(generationLanguage).replace("<will be specified per mode>", "Organic")}`;
}

function buildFromResearchSystem(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string,
  learningsContext?: string,
  researchContext?: string,
  generationLanguage?: string
): string {
  const productContext = buildProductContext(product, productBrief, guidelines, segments, hookInspiration, learningsContext, researchContext);

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

${getOutputInstructions(generationLanguage).replace("<will be specified per mode>", "Research")}`;
}

function buildFromInternalSystem(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string,
  learningsContext?: string,
  researchContext?: string,
  generationLanguage?: string
): string {
  const productContext = buildProductContext(product, productBrief, guidelines, segments, hookInspiration, learningsContext, researchContext);

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

${getOutputInstructions(generationLanguage).replace("<will be specified per mode>", "Matrix/Coverage")}`;
}

function buildUnawareSystem(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string,
  learningsContext?: string,
  researchContext?: string,
  generationLanguage?: string
): string {
  const productContext = buildProductContext(product, productBrief, guidelines, segments, hookInspiration, learningsContext, researchContext);

  return `You are a senior direct-response creative strategist specializing in UNAWARE ads — the hardest but highest-scaling ad type. You create ads that grab people who aren't looking for a solution and make them feel a gap they didn't know existed.

These ads read like content, not ads. They are aggressive with their disguise and belief shifting. They open up the market by pulling from the biggest possible emotional pools instead of fishing for the small group already searching.

IMPORTANT: All concepts you generate MUST target the "Unaware" awareness level.

${CASH_FRAMEWORK}

${COPY_BLOCKS_DEEP}

${UNAWARE_AD_TYPES}

${NATIVE_AD_PSYCHOLOGY}

${NARRATIVE_ARCHETYPES}

---

## PRODUCT KNOWLEDGE

${productContext}

---

## VISUAL DIRECTION FOR UNAWARE/NATIVE ADS

The IMAGE is the most important element of a native ad. It must stop the scroll by being WEIRD, RANDOM, or UNCOMFORTABLE — NOT by being polished or pretty. The image must make someone think "wait, what?" or "ugh" or "that's so me" — never "oh that's an ad."

You're competing against the article someone was just reading. Your image must be MORE INTERESTING than that article's images. A product shot loses every time. A provocative, unexpected image wins.

IMAGE IDEA PRINCIPLES:
- The image should feel RANDOM and DISCONNECTED from the product. A fridge interior with supplements next to pizza boxes. Hands gripping a steering wheel at 3 AM. A woman at a birthday party shielding her eyes while everyone else laughs. A bathroom counter with 6 half-empty bottles lined up. A close-up of skin texture under harsh fluorescent light.
- The weirder and more unexpected, the better. If it makes you uncomfortable, it probably converts.
- Images should create a question the viewer can't answer without clicking: "what's wrong with her at that party?" "why are there so many bottles?"
- NEVER describe the product or solution in the image. The image shows the PROBLEM or a RANDOM provocative scene.

THE IMAGE-HEADLINE RELATIONSHIP (CRITICAL):
Image and headline do TWO DIFFERENT JOBS:
- IMAGE → creates an emotion or unanswered question (recognition, disgust, curiosity)
- HEADLINE → answers it halfway, opens a DIFFERENT curiosity gap you can only close by clicking
If image shows a bathroom counter full of products and headline says "you're using too many products" — FAIL. Same message twice.
Instead: image = bathroom counter chaos ("ugh, that's my counter") → headline = "The daily habit that's actually making your skin worse" (DIFFERENT question).

Visual direction MUST specify which native image type AND describe a SPECIFIC, WEIRD image idea:
1. native-medical — anatomical diagrams, X-ray scans, vintage anatomical plates on aged parchment, microscopy, heat maps, CT scans, comic/graphic novel panels. Looks like it came from WebMD or a medical textbook.
2. native-closeup — disgusting/provocative objects on lab benches, exhaustion portraits under harsh fluorescent, hands close-ups (gripping steering wheel, pressing temples), emotional isolation (suffering while others are fine), metaphorical objects (unexpected visual that creates cognitive dissonance). Raw, visceral, involuntary attention.
3. native-messy — cluttered nightstands, kitchen counters with vitamin chaos, bathroom shelves, car dashboards at commute time, desk flat-lays telling exhaustion stories, purse dumps, fridge interiors showing intention-vs-reality. Looks like someone's actual phone photo.

BAD visual direction: "Medical illustration of spine alignment" (generic, boring)
GOOD visual direction: "native-medical: Vintage anatomical copperplate engraving of cervical vertebrae on heavily aged parchment with Latin labels, foxing marks, water stains, frayed edges — looks like a 200-year-old medical textbook page that was just discovered"

BAD visual direction: "Messy nightstand with pills" (generic, seen 1000 times)
GOOD visual direction: "native-messy: Overhead flat-lay of a bathroom counter at 6 AM — concealer tube with cap sitting separately, energy drink half-empty, three different under-eye creams lined up, a phone face-down. The objects tell the story of someone hiding their exhaustion every morning. Harsh fluorescent bathroom light."

## CONCEPT PHILOSOPHY FOR NATIVE ADS

Native ad concepts are NOT traditional ad campaigns with a catchy name. They are ANGLES OF ATTACK — a specific belief to shift, a curiosity to exploit, a worldview to tap. The concept should answer: "What weird image + editorial headline combination will make someone who isn't looking for ${product.name} click on this?"

Think like a tabloid editor, not an ad creative director. What headline would make someone click on a health blog article? What image next to that headline would make it irresistible?

Your concept names should reflect the ANGLE, not sound like ad campaigns:
BAD concept names: "The Ultimate Solution", "Health Revolution", "The Comfort Promise"
GOOD concept names: "The Supplement Autopsy", "Absorption Paradox", "The Kitchen Counter Audit"

Your hooks should be things real people would click on in a news feed:
BAD hooks: "Our product is the best solution for your problem" (sounds like an ad)
GOOD hooks: "Dermatologists in Seoul have been recommending this since 2019. Scandinavia just caught on.", "The concerning thing that happens to your body after 40 (and why your morning routine won't fix it)"

${HEADLINE_FORMULAS}

Generate editorial-style native_headlines using these formulas. They should read like CNN or WebMD article titles, NOT ad headlines.

${getOutputInstructions(generationLanguage).replace("<will be specified per mode>", "Wildcard").replace(
  '"awareness_level": "Unaware | Problem Aware | Solution Aware | Product Aware | Most Aware"',
  '"awareness_level": "Unaware"'
).replace(
  /("ad_copy_headline": \["2 headline variations \([^)]+\)"\]),/,
  '$1,\n      "native_headlines": ["3-5 editorial-style headlines using the native formulas above — these read like CNN/WebMD article titles, NOT ad headlines"],'
).replace(
  /("ad_copy_primary": \["1 primary ad text \()[^"]+("\],)/,
  '"ad_copy_primary": ["1 primary ad text — for native/unaware ads, write as an ADVERTORIAL OPENING (150-300 words). Never mention the product in the first 150 words. Open with education, story, or shocking fact. Use SHORT PARAGRAPHS with line breaks (\\\\n\\\\n) between each thought. One sentence per paragraph. The reader should be halfway through before they realize this might lead somewhere."],'
).replace(
  '"visual_direction": "What the static ad image should look like — layout, imagery, mood, text overlay approach",',
  '"visual_direction": "MUST specify native image type (native-medical, native-closeup, or native-messy) + a SPECIFIC weird/provocative image idea. Describe the exact scene, objects, lighting, and mood. The image should make someone stop scrolling because it is unexpected, not because it is pretty.",'
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
- Visual direction MUST describe a SPECIFIC weird/provocative image — not generic descriptions. Include the native image type (native-medical, native-closeup, or native-messy), exact scene composition, key objects, and lighting mood.
- native_headlines MUST read like editorial article titles you'd see on CNN, WebMD, or a health blog — NOT like ad headlines
- ad_copy_primary should read like the opening paragraphs of a long-form article/advertorial — NOT short ad copy. Never mention the product in the first 150 words. Use short paragraphs with line breaks between each thought.
- Destination should be implied as advertorial/educational content, not direct product page
- The concept name should reflect the psychological ANGLE, not sound like an ad campaign name`;
}

function buildFromTemplateSystem(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string,
  learningsContext?: string,
  researchContext?: string,
  generationLanguage?: string
): string {
  const productContext = buildProductContext(product, productBrief, guidelines, segments, hookInspiration, learningsContext, researchContext);

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

${getOutputInstructions(generationLanguage).replace("<will be specified per mode>", "Templates")}`;
}

// ---------------------------------------------------------------------------
// From Competitor Ad — Claude Vision analysis + Nano Banana prompt generation
// ---------------------------------------------------------------------------

function buildPainPointLabels(segments: ProductSegment[]): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const seg of segments) {
    const slug = seg.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const desc = [seg.name.toUpperCase()];
    if (seg.core_desire) desc.push(seg.core_desire);
    if (seg.core_constraints) desc.push(seg.core_constraints);
    labels[slug] = desc.join(" — ");
  }
  labels["general"] = "GENERAL PRODUCT BENEFITS — overall value, quality, results, guarantee, social proof";
  return labels;
}

function buildFromCompetitorAdSystem(
  product: ProductFull,
  productBrief: string | undefined,
  guidelines: CopywritingGuideline[],
  segments: ProductSegment[],
  hookInspiration?: string,
  learningsContext?: string,
  researchContext?: string,
  imageCount?: number,
  variationsPerImage?: number,
  painPoint?: string,
  generationLanguage?: string
): string {
  const productContext = buildProductContext(product, productBrief, guidelines, segments, hookInspiration, learningsContext, researchContext);

  return `You are a senior direct-response creative strategist and visual analyst specializing in health & wellness ecommerce for Scandinavian markets (Sweden, Norway, Denmark). You reverse-engineer competitor ads — analyzing their visual structure, persuasion techniques, and copy approach — then generate adapted concepts for our product with image generation prompts that faithfully reproduce the competitor's visual format.

You have two combined skills:
1. **Ad Strategist**: You understand direct-response frameworks (C.A.S.H., Copy Blocks) and can map any ad to its underlying persuasion mechanics.
2. **Visual Analyst**: You can deconstruct an image's layout, typography, color palette, lighting, composition, and mood — then describe it precisely enough for an AI image generator to reproduce the format.

${CASH_FRAMEWORK}

${COPY_BLOCKS_DEEP}

---

## PRODUCT KNOWLEDGE

${productContext}

---

## COMPETITOR AD ANALYSIS INSTRUCTIONS

When you receive the competitor ad image, perform this analysis:

### 1. VISUAL STRUCTURE ANALYSIS
Describe the ad's visual composition in detail:
- **Layout**: Grid structure, text placement zones (top/middle/bottom), image-to-text ratio
- **Typography**: Font style (serif/sans-serif/handwritten/bold display), size hierarchy, color of text, any text effects (shadow, outline, gradient)
- **Color palette**: Dominant colors, accent colors, background treatment (solid/gradient/photo)
- **Imagery**: Photo style (studio/lifestyle/UGC), subject matter, crop/framing, any overlays or graphics
- **Visual devices**: Badges, stamps, arrows, circles, before/after splits, product callouts, price tags
- **Aspect ratio**: Detect whether the image is 1:1 (square), 4:5 (portrait feed), or 9:16 (stories/reels)

### 2. PERSUASION TECHNIQUE IDENTIFICATION
Analyze WHY this ad works psychologically:
- What scroll-stop mechanism does it use? (pattern interrupt, curiosity gap, emotional trigger, identity statement, fear/urgency)
- What awareness level does it target? (Unaware through Most Aware)
- Which Copy Blocks are present? (Pain level, Promise level, Proof types, Curiosity techniques, Constraints addressed)
- What angle is being used? (Story, Contrarian, Expert, Root Cause, etc.)

### 3. C.A.S.H. DNA MAPPING
Map the competitor ad to the CASH framework:
- Concept type (avatar_facts / market_facts / product_facts / psychology_toolkit)
- Angle (from the 20 standard angles)
- Style (from the 11 standard styles)
- Awareness level
- Copy blocks used with depth levels

### 4. ADAPTED CONCEPT GENERATION
Create an original concept for OUR product that:
- Reproduces the SAME visual format and persuasion STRUCTURE (e.g. testimonial style, before/after, UGC selfie, zoomed-in detail shot)
- **CRITICAL: The adapted concept MUST be about OUR product's actual problem domain and benefits.** Do NOT keep the competitor's problem/solution angle. Map the persuasion structure to ${product.name}'s real benefits and problem domain as described in the PRODUCT KNOWLEDGE section above.
- The competitor's specific health claims, ingredients, and problem domain are IRRELEVANT to us — only their ad FORMAT and persuasion MECHANICS matter
- Does NOT copy the competitor's specific claims or brand elements
- Think: "What would this exact visual format look like if it was about ${product.name} and the problems it solves?" — NOT "How can I loosely connect the competitor's angle to our product?"
- Maintains the emotional energy of the original while being completely original in content and problem domain

${(() => {
  const ppLabels = buildPainPointLabels(segments);
  const segmentNames = segments.map(s => s.name).join(", ");
  if (painPoint && painPoint !== "auto-detect" && ppLabels[painPoint]) {
    return `### MANDATORY PAIN POINT FOCUS

**You MUST focus ALL hooks, copy, and messaging on this single pain point: ${ppLabels[painPoint]}.**

Do NOT mix multiple pain points. Every hook, headline, and ad copy text must be about this one angle. If the competitor ad addresses a different problem, map their persuasion structure to THIS pain point specifically.`;
  }
  return `### PAIN POINT SELECTION

Choose the SINGLE most natural pain point for this competitor ad's persuasion structure. Pick ONE from: ${segmentNames || "general product benefits"}. Do NOT mix multiple pain points in the same concept. All hooks, headlines, and ad copy must focus on that one chosen angle.`;
})()}

### AD COPY ADAPTATION

When competitor ad copy text is provided, you MUST deeply analyze and ADAPT it — not generate generic copy:

1. **Structure Mapping**: Identify the copy's structure (hook → problem agitation → solution pivot → proof → CTA). Map each structural element to our product.
2. **Tone Matching**: Match the competitor's tone. Casual → casual. Urgent → urgent. Long-form storytelling → long-form storytelling.
3. **Persuasion Transfer**: Reproduce their persuasion techniques (social proof, authority, scarcity, curiosity gap, identity) with our product's claims.
4. **Length Matching**: If the competitor's text is 50 words, yours should be ~50 words. If 200, yours ~200.
5. **Hook Adaptation**: Reproduce the hook TYPE (question, statistic, story opener, bold claim) with our product's angle.

The ad_copy_primary MUST clearly derive from the competitor's approach — a reader should recognize the structural DNA.

If NO competitor ad copy is provided, generate strong direct-response copy based on the visual ad's implied messaging and the chosen pain point.

### 5. NANO BANANA IMAGE PROMPT GENERATION

You will receive ${imageCount ?? 1} competitor image(s). For EACH image, generate exactly ${variationsPerImage ?? 1} visually distinct Nano Banana prompt(s).

${(imageCount ?? 1) > 1 ? `Since there are ${imageCount} images in this competitor concept, analyze them as a COHESIVE SET. Understand the overall concept, then generate prompts for each image that maintain the set's visual consistency while adapting for our product.` : ""}

Each variation of the same image MUST differ in visual composition — NOT just rewording. Vary these elements across variations:
- Camera angle / framing (close-up, medium shot, wide, overhead, low angle)
- Lighting setup (warm morning light, cool studio, harsh directional, soft diffused)
- Background treatment (different textures, environments, or color temperatures)
- Composition balance (product placement, negative space, asymmetry)

Minor hook text tweaks are encouraged across variations (same core message, different emphasis or wording).

Total image_prompts entries: ${(imageCount ?? 1)} images x ${variationsPerImage ?? 1} variations = ${(imageCount ?? 1) * (variationsPerImage ?? 1)} entries.

Each entry MUST include "source_index" (0-based) indicating which uploaded image it is a variation of.

Generate prompts for the Nano Banana AI image generator (nano-banana-2) that reproduce the competitor's visual FORMAT with our product's content.

**Nano Banana Prompt Rules:**
${USE_JSON_PROMPTING ? `
**JSON PROMPT FORMAT (for native/UGC-style competitor ads):**
If the competitor ad is a native/UGC-style image (no visible product, candid photo, lifestyle scene, etc.), the "prompt" field in each image_prompt entry MUST be a structured JSON OBJECT — NOT plain text. This prevents "concept bleeding" where subject details contaminate lighting or background details.

JSON Schema (every key required for native ads):
{
  "Style": "photographic approach — e.g. 'overhead-flat-lay', 'direct-flash-candid', 'documentary-portrait'",
  "Subject": "main focal point with specific physical details: age, appearance, expression, clothing material and condition",
  "MadeOutOf": "material specs for ALL visible surfaces and fabrics — controls texture rendering",
  "Arrangement": "spatial layout: pose/position, object placement relative to each other",
  "Background": "setting beyond immediate scene, out-of-focus elements",
  "RoomObjects": "specific objects with CONDITION details: half-empty, cap off, stained, worn, expired",
  "Accessories": "detail elements on or near the subject",
  "ColorRestriction": "ALWAYS muted for native — specify exact palette limits",
  "Lighting": "specific source WITH direction AND quality — be precise as a cinematographer",
  "Camera": {"type": "device name", "lens": "focal length", "aperture": "f-stop", "flash": "on/off", "iso_grain": "noise description"},
  "Imperfections": "MANDATORY — at least 2: sensor noise, grain, soft focus, vignetting, chromatic aberration",
  "Textures": "surface details: pores, fabric weave, scratches, coffee rings. Nothing smooth.",
  "OutputStyle": "final style suffix matching the photographic approach",
  "Mood": "emotional register anchored to a SPECIFIC moment in time"
}

If the competitor ad is a PRODUCT-focused ad (product prominently visible, studio shot, etc.), use a plain text string prompt instead.
` : `- Write 2-4 dense sentences per prompt. Subject first, weave in details naturally.`}
- Be SPECIFIC about lighting (soft diffused / harsh directional / warm golden / cool blue), texture (matte / glossy / grainy / smooth), and materials
- Describe the MOOD last (clinical, warm, urgent, calm, editorial)
- **TEXT IN IMAGES — CRITICAL**: You MUST analyze whether the competitor ad has text overlays or not.
  - **If the competitor ad has NO text overlays** (pure photo, native/UGC style, clean lifestyle shot, no words visible in the image at all): set hook_text and headline_text to EMPTY STRINGS ("") and set \`"has_text": false\`. The generated image should be a CLEAN image with NO text — matching the competitor's text-free visual style.
  - **If the competitor ad HAS text overlays** (bold headlines, hook text, captions, call-to-action text, etc. layered ON TOP of the image): provide adapted hook_text and headline_text for our product, and set \`"has_text": true\`. These will be appended to the Nano Banana prompt as text overlay instructions. Your Nano Banana prompt should describe the VISUAL SCENE only — the text will be added automatically. **TEXT SAFE ZONE**: All text overlays MUST be placed in the vertical MIDDLE of the image (between 15% and 80% from top). NEVER place text at the very top or bottom edges — these areas are covered by Stories/Reels UI (username, captions, CTA buttons) when the image is outpainted to 9:16.
  - **If the competitor ad has text that is physically PART OF THE SCENE** (handwritten on body/skin, written on paper/sign, tattoo-style text, marker text, text on a product label, text on a mirror, whiteboard, Venn diagram, etc.): you MUST describe the ADAPTED text for our product directly in the Nano Banana prompt${USE_JSON_PROMPTING ? ' (in the "Subject" or "RoomObjects" key of the JSON)' : ''}. Example: if a beauty supplement competitor has "Drains the cortisol face" written on skin, your prompt must say something like "handwritten text on her upper arm reading 'Stopped snoring after one night on this pillow' in the same casual marker style". In this case, set hook_text and headline_text to empty strings since the text is already in the prompt, BUT set \`"has_text": true\` so the image gets translated to other languages.
  - Each image_prompt variation should use a different hook_text (when text overlays are present).
- Focus on reproducing the competitor's visual STYLE, not their specific product
- The competitor image is NOT passed to Nano Banana — your prompt must be SELF-CONTAINED and describe the entire desired image without relying on a visual reference. Be very specific about layout, composition, colors, and style.
- If the competitor ad has a person, describe the type of person (age range, expression, setting) without specifying ethnicity
- If the competitor ad uses a product shot, describe how our product should be positioned in the same style
- **PRODUCT REFERENCE CONTROL — MIRROR THE COMPETITOR**: For each image_prompt, set \`"include_product_reference": true\` ONLY if the competitor ad itself prominently features their physical product (someone holding a bottle/jar/package, product on a table, studio product shot, unboxing, etc.). If the competitor ad does NOT show any physical product — e.g. people talking, a podcast scene, a conversation, a meme, a face close-up, a before/after, a medical chart, an interview, a lifestyle moment without a product, an infographic, a text-only ad — then set \`"include_product_reference": false\` and do NOT inject our product into the scene. The rule is simple: **if the competitor didn't show THEIR product, don't show OUR product.** Reproduce the competitor's visual FORMAT, not force a product placement where none existed.
- **PRODUCT APPEARANCE — NO HALLUCINATION**: When describing OUR product in the Subject, MadeOutOf, RoomObjects, Accessories, or Arrangement fields, you MUST use ONLY the physical details from the "PRODUCT PHYSICAL APPEARANCE" section of PRODUCT KNOWLEDGE above. **NEVER invent color, material, shape, or size.** The competitor's product looks completely different from ours — do NOT describe their product's appearance. Do NOT write phrases like "amber bottle", "brown glass bottle", "dark glass vial", "clear bottle", "supplement jar" unless those EXACT words appear in PRODUCT PHYSICAL APPEARANCE. If PRODUCT PHYSICAL APPEARANCE says "white plastic bottle", write "white plastic bottle" — never "amber", never "glass". When in doubt, use generic language like "the ${product.name} bottle" and let the reference image handle the rest. Getting this wrong produces broken images where the generated bottle looks nothing like our real product.

${USE_JSON_PROMPTING ? '' : "**Nano Banana prompt structure:**\n`[Subject/scene description with specific details]. [Lighting and atmosphere]. [Textures, materials, and technical details]. [Overall mood and feeling].`\n\nExample quality level (do NOT copy — shows density and specificity):\n\"A supplement bottle centered on a weathered wooden nightstand beside a rumpled bed, morning light streaming through sheer curtains casting soft warm shadows across the scene. Shallow depth of field with the bottle sharp and background softly blurred, natural grain texture. Intimate, relatable, early-morning wellness ritual mood.\"\n"}
---

## OUTPUT FORMAT

Return a SINGLE JSON object (NOT wrapped in a "proposals" array — this mode has a different structure):

{
  "analysis": {
    "visual_structure": "Detailed description of the competitor ad's layout, typography, colors, imagery, and visual devices",
    "persuasion_technique": "What makes this ad work psychologically — the scroll-stop mechanism, emotional triggers, and belief chain",
    "estimated_awareness_level": "Unaware | Problem Aware | Solution Aware | Product Aware | Most Aware",
    "competitor_copy_summary": "Summary of the competitor's text/messaging approach — what they claim, how they frame the problem/solution",
    "aspect_ratio": "1:1 | 4:5 | 9:16 (detected from the image dimensions and content layout)"
  },
  "concept": {
    "concept_name": "Short memorable name (2-5 words)",
    "concept_description": "2-3 sentences describing the adapted concept and why it would work for our product",
    "cash_dna": {
      "concept_type": "avatar_facts | market_facts | product_facts | psychology_toolkit",
      "angle": "one of the 20 angles",
      "style": "one of the 11 styles",
      "hooks": ["3-5 hook line variations adapted for our product"],
      "awareness_level": "Unaware | Problem Aware | Solution Aware | Product Aware | Most Aware",
      "ad_source": "Swipe (competitor)",
      "copy_blocks": ["array of blocks used with depth levels"],
      "concept_description": "same as outer concept_description"
    },
    "ad_copy_primary": ["1 primary ad text (${langLabel(generationLanguage ?? "en")}). ADAPT from the competitor's copy structure, tone, and length — reproduce their hook style, agitation pattern, proof types, and CTA. Match their word count. Use SHORT PARAGRAPHS with line breaks between each thought — one sentence per paragraph, never a wall of text. Must read as a structural adaptation, not generic product copy."],
    "ad_copy_headline": ["2 headline variations (${langLabel(generationLanguage ?? "en")}, max 40 chars). Match the competitor's headline STYLE: question→question, number→number, bold claim→bold claim."],
    "visual_direction": "What the static ad image should look like — referencing the competitor's format but adapted for our product",
    "differentiation_note": "How this concept differs from the competitor's ad — what we kept (structure/technique) vs what we changed (content/claims/product)",
    "suggested_tags": ["competitor-swipe", "2-4 additional relevant tags"]
  },
  "image_prompts": [
    {
      "source_index": 0,
      "prompt": ${USE_JSON_PROMPTING ? '"JSON OBJECT (for native/UGC ads) or plain text STRING (for product-focused ads)"' : '"Nano Banana prompt (2-4 dense sentences)..."'},
      "hook_text": "Main text overlay (or empty string if competitor ad has NO text)",
      "headline_text": "Secondary text line (or empty string if no text)",
      "has_text": true,
      "include_product_reference": true
    }
  ]
}

CRITICAL RULES:
- Write ALL ad copy in ${langLabel(generationLanguage ?? "en").toUpperCase()}${(generationLanguage ?? "en") === "en" ? " (translations happen later)" : " (translations to other markets happen later). Image prompts (Nano Banana) must ALWAYS be in English."}
- NEVER copy the competitor's specific claims, brand name, or product references
- NEVER invent medical claims — only use claims from our product brief
- **NEVER keep the competitor's problem domain.** The adapted hooks MUST be about what ${product.name} actually solves — refer to the PRODUCT KNOWLEDGE section for the real benefits and problem domain. The competitor's problem space is irrelevant. Only their visual format and persuasion structure matter.
- The image_prompts should reproduce the competitor's VISUAL FORMAT, not their product or messaging angle
- The competitor image is NOT passed to Nano Banana — your prompt must fully describe the desired image on its own
- **NATIVE ADS — MIRROR PRODUCT VISIBILITY**: If the competitor ad shows someone holding/using THEIR product, your adapted version should also show OUR product — set \`include_product_reference: true\`. But if the competitor ad has NO physical product visible (podcast hosts talking, interview scene, meme format, conversation, face close-up, medical scene, lifestyle without product, text-heavy graphic), then do NOT add our product — set \`include_product_reference: false\` and keep the scene organic. Your Nano Banana prompt should recreate the same SCENE TYPE (podcast setting, conversation, etc.) adapted to our product's problem domain, NOT a product shot.
- **If the competitor ad has text baked into the image (handwritten, marker, tattoo-style, on a sign, on skin, etc.), your Nano Banana prompt MUST include the adapted text for our product directly in the prompt.**
- **NO URLS IN AD COPY**: Never include website URLs, link placeholders like [LINK], [LÄNK], [URL], or domain names in ad_copy_primary or ad_copy_headline. The landing page URL is attached separately by the ad platform. If the competitor's copy contains their website URL (e.g. "Free shipping 👉 shop.competitor.com"), adapt to a natural CTA without any URL (e.g. "Free shipping 👉 Shop now"). The viewer clicks anywhere on the ad to reach the landing page.
- **NO PRICES ANYWHERE**: Never invent or include prices, currency amounts, or money symbols (€, $, £, kr, SEK, NOK, DKK, EUR, USD) in ANY field of your output. This includes ad_copy_primary, ad_copy_headline, AND cash_dna.hooks, cash_dna.concept_description, visual_direction, and every image_prompt. The reason: cash_dna.hooks is used downstream to write overlay text for generated images, so a hook like "Why your €80 serum can't reach where aging happens" ends up BAKED INTO the actual image (we've had this happen). Pricing belongs on the landing page only. The ONLY exception: if the competitor's hook hinges on a specific price (e.g. "I spent X on Y"), you may keep it ONLY IF you convert it to Swedish kronor (SEK) — never EUR, USD, GBP, or any other foreign currency. Default behaviour: write the entire concept with no prices at all, in ANY field.
- Return ONLY valid JSON, no markdown fences, no explanation text
- Generate exactly ${(imageCount ?? 1) * (variationsPerImage ?? 1)} entries in the image_prompts array
- Each entry MUST have a source_index (0-based) matching the uploaded image it is based on
- For each source image, generate exactly ${variationsPerImage ?? 1} visually distinct variation(s)
- Each variation MUST differ in visual composition (angle, lighting, framing), not just text`;
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
    hookInspiration?: string,
    learningsContext?: string,
    researchContext?: string,
    generationLanguage?: string
  ) => string
> = {
  from_scratch: buildFromScratchSystem,
  from_organic: buildFromOrganicSystem,
  from_research: buildFromResearchSystem,
  from_internal: buildFromInternalSystem,
  unaware: buildUnawareSystem,
  from_template: buildFromTemplateSystem,
  from_competitor_ad: () => {
    throw new Error("from_competitor_ad uses special call path - see buildBrainstormSystemPrompt");
  },
  video_ugc: () => {
    throw new Error("video_ugc mode uses its own prompt builder — see video-brainstorm.ts");
  },
  pixar_animation: () => {
    throw new Error("pixar_animation mode uses its own prompt builder — see pixar-brainstorm.ts");
  },
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
  hookInspiration?: string,
  learningsContext?: string,
  competitorImageCount?: number,
  variationsPerImage?: number,
  painPoint?: string,
  researchContext?: string,
  generationLanguage?: string
): string {
  // from_competitor_ad needs extra params (image count + variations + pain point)
  if (mode === "from_competitor_ad") {
    return buildFromCompetitorAdSystem(
      product, productBrief, guidelines, segments,
      hookInspiration, learningsContext,
      researchContext,
      competitorImageCount, variationsPerImage,
      painPoint,
      generationLanguage
    );
  }
  const builder = SYSTEM_BUILDERS[mode];
  return builder(product, productBrief, guidelines, segments, hookInspiration, learningsContext, researchContext, generationLanguage);
}

/**
 * Build the user prompt based on mode-specific inputs.
 */
export function buildBrainstormUserPrompt(
  request: BrainstormRequest,
  segments: ProductSegment[],
  existingConcepts?: Array<{ name: string; angle: string; awareness: string }>,
  rejectedConcepts?: Array<{ angle: string | null; awareness_level: string | null; concept_description: string | null }>,
  recentAngles?: string[],
  recentVisualScenes?: string[]
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

    case "from_competitor_ad": {
      parts.push("## SWIPE: FROM COMPETITOR AD");
      const imgCount = request.competitor_image_urls?.length ?? 1;
      parts.push(
        imgCount > 1
          ? `Analyze the ${imgCount} competitor ad images attached below as a cohesive concept set. Reverse-engineer their visual structure, identify why they work together, and create adapted versions for our product.`
          : "Analyze the competitor ad image attached below. Reverse-engineer its visual structure, identify why it works, and create an adapted version for our product."
      );
      if (request.competitor_pain_point && request.competitor_pain_point !== "auto-detect") {
        parts.push(`\n**REQUIRED PAIN POINT:** ${request.competitor_pain_point.replace(/-/g, " ")} — ALL copy and hooks must focus on this single angle. Do NOT mix other pain points.`);
      }
      if (request.competitor_ad_copy) {
        parts.push(`\n### COMPETITOR AD COPY (from Meta Ads Library)\n${request.competitor_ad_copy.slice(0, 3000)}`);
        parts.push("\n**CRITICAL**: Deeply adapt this copy's structure, tone, length, and persuasion techniques for our product. The ad_copy_primary output must be a structural adaptation of the above — not generic product copy. Match their hook style, agitation pattern, proof types, and CTA approach.");
      } else {
        parts.push("\n*No competitor ad copy was provided.* Generate strong direct-response ad copy based on the visual analysis and the chosen pain point.");
      }
      parts.push(`\nGenerate 1 concept. For each of the ${imgCount} image(s), generate ${count} visual variation(s) = ${imgCount * count} total image prompts.`);
      break;
    }

    case "pixar_animation": {
      // Handled by pixar-brainstorm.ts
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
  if (request.narrative_archetypes && request.narrative_archetypes.length > 0) {
    const archetypeLabels: Record<string, string> = {
      confession: "The Confession (Personal shame → discovery → resolution)",
      rage: "The Rage (Systemic injustice → validation → action)",
      double_standard: "The Double Standard (Unfair comparison → gaslight list → permission)",
      witness: "The Witness (Observer perspective → shared risk → protection)",
    };
    const archetypes = request.narrative_archetypes
      .map((a) => archetypeLabels[a] ?? a)
      .join(", ");
    parts.push(`\n**Required narrative archetype(s):** ${archetypes}`);
    parts.push(
      `Each concept MUST use one of the specified narrative archetypes. Follow the archetype's story structure exactly — the ad_copy_primary should be a long-form story (200-400 words) using the archetype's emotional progression. Include the archetype name in suggested_tags (e.g. "archetype:confession").`
    );
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

  // Diversity enforcement: avoid angles used in the past 7 days
  if (recentAngles && recentAngles.length > 0) {
    const uniqueAngles = [...new Set(recentAngles)];
    parts.push(`\n### RECENTLY USED ANGLES (last 7 days — DO NOT repeat these)`);
    parts.push(uniqueAngles.join(", "));
    parts.push(`You MUST pick a different angle than the ${uniqueAngles.length} listed above. There are 20+ angles in the framework — explore the ones NOT on this list.`);
  }

  // Visual scene diversity: avoid scenes/locations used in recent concepts
  if (recentVisualScenes && recentVisualScenes.length > 0) {
    parts.push(`\n### RECENTLY USED VISUAL SCENES (last 7 days — DO NOT repeat these locations/compositions)`);
    for (const scene of recentVisualScenes) {
      parts.push(`- ${scene}`);
    }
    parts.push(`Your visual_direction MUST use DIFFERENT locations, framings, and compositions than the scenes listed above. The native ad dimensional system has 17+ locations, 6+ framings, 8+ lighting setups — explore the ones NOT on this list. NEVER generate another nightstand/bedside scene if one appears above.`);
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
  {
    value: "from_competitor_ad",
    label: "From Competitor Ad",
    description: "Upload a winning competitor ad — AI reproduces its format for your product",
    icon: "Copy",
  },
  {
    value: "video_ugc",
    label: "Video UGC",
    description: "Generate AI video UGC concepts with scripts and Sora prompts",
    icon: "Video",
  },
  {
    value: "pixar_animation",
    label: "Pixar Animation",
    description: "Generate viral talking object/body part video ads in Pixar 3D animated style",
    icon: "Clapperboard",
  },
];

// ---------------------------------------------------------------------------
// V3.4: Claude-powered iteration copy rewrite
// ---------------------------------------------------------------------------

interface IterationCopyOpts {
  parentName: string;
  parentCopy: { primary: string[]; headlines: string[] };
  parentDna: CashDna;
  iterationType: IterationType;
  iterationContext: Record<string, unknown>;
  productContext: string; // Pre-built via buildProductContext()
  generationLanguage?: string;
}

function buildIterationPrompt(opts: IterationCopyOpts): { system: string; user: string } {
  const { parentName, parentCopy, parentDna, iterationType, iterationContext } = opts;

  const system = `You are a senior direct-response copywriter specializing in ad iteration. You take WINNING ad copy and create strategic variations by changing one dimension while keeping the proven core intact.

${opts.productContext}

## Your Task
Rewrite the winning ad copy below based on the iteration instructions. Produce:
- 1 primary text (${langLabel(opts.generationLanguage ?? "en")}, 100-200 words). Use SHORT PARAGRAPHS with line breaks between each thought — one sentence per paragraph, never a wall of text.
- 2 headline variations (${langLabel(opts.generationLanguage ?? "en")}, max 40 chars each)

## Rules
- Keep what works: The parent concept PROVED itself — preserve the emotional core
- Change only what the iteration type specifies
- Write in ${langLabel(opts.generationLanguage ?? "en")}${(opts.generationLanguage ?? "en") === "en" ? " (translations happen later)" : ""}
- NEVER invent medical claims
- Apply Copy Blocks techniques: Pain Chain, Proof Braid, Curiosity characterizations, C.R.A.V.E.S.
- Return ONLY valid JSON, no markdown fences`;

  let iterationInstructions = "";

  switch (iterationType) {
    case "segment_swap": {
      const segName = iterationContext.segment_name ?? "unknown";
      const segDesc = iterationContext.segment_description ?? "";
      const segDesire = iterationContext.segment_core_desire ?? "";
      const segConstraints = iterationContext.segment_core_constraints ?? "";
      const segDemographics = iterationContext.segment_demographics ?? "";
      iterationInstructions = `## SEGMENT SWAP
Rewrite for a new audience segment: **${segName}**
${segDesc ? `Description: ${segDesc}` : ""}
${segDesire ? `Core desire: ${segDesire}` : ""}
${segConstraints ? `Core constraints: ${segConstraints}` : ""}
${segDemographics ? `Demographics: ${segDemographics}` : ""}

Keep the same angle (${parentDna.angle}) and hook structure. Adapt language, examples, emotional triggers, and pain points to resonate specifically with this audience. The ad should feel like it was written FOR them.`;
      break;
    }
    case "mechanism_swap": {
      const newMechanism = iterationContext.new_mechanism ?? "";
      iterationInstructions = `## MECHANISM SWAP
Same emotional triggers and promise, but explain the product differently.
Original angle/mechanism: ${parentDna.angle}
New mechanism: **${newMechanism}**

Keep the same pain points and desired outcomes. Change HOW the product solves the problem — the "what it does for you" stays the same, the "how" changes.`;
      break;
    }
    case "cash_swap": {
      const element = String(iterationContext.swap_element ?? "");
      const originalValue = String(iterationContext.original_value ?? "");
      const newValue = String(iterationContext.new_value ?? "");

      if (element === "hook") {
        iterationInstructions = `## HOOK SWAP
Original hook: "${originalValue}"
New hook: **"${newValue}"**

The hook sets up the rest of the ad. Rewrite the body copy to pay off the new hook's promise. The opening line changes everything — adapt the flow, examples, and build-up to match.`;
      } else if (element === "angle") {
        iterationInstructions = `## ANGLE SWAP
Original angle: ${originalValue}
New angle: **${newValue}**

Same product benefits, framed through a completely different lens. The emotional triggers, proof points, and narrative structure should reflect the new angle.`;
      } else if (element === "style") {
        iterationInstructions = `## STYLE SWAP
Original style: ${originalValue}
New style: **${newValue}**

Adjust tone, pacing, formatting, and language register to match the new style. A "native-medical" style reads like a health article. A "bold-statement" style is punchy and declarative. Match the voice.`;
      }
      break;
    }
  }

  const parentCopyText = parentCopy.primary
    .map((p, i) => `### Primary Text ${i + 1}\n${p}`)
    .join("\n\n");
  const parentHeadlinesText = parentCopy.headlines
    .map((h, i) => `${i + 1}. ${h}`)
    .join("\n");

  const user = `## WINNING PARENT CONCEPT: "${parentName}"

### CASH DNA
- Angle: ${parentDna.angle ?? "unknown"}
- Awareness: ${parentDna.awareness_level ?? "unknown"}
- Style: ${parentDna.style ?? "unknown"}
- Concept type: ${parentDna.concept_type ?? "unknown"}
- Hooks: ${(parentDna.hooks ?? []).join(" | ")}

### Current Ad Copy (PROVEN WINNER)
${parentCopyText}

### Current Headlines
${parentHeadlinesText}

---

${iterationInstructions}

---

Return JSON:
{
  "ad_copy_primary": ["variation 1..."],
  "ad_copy_headline": ["headline 1...", "headline 2..."]
}`;

  return { system, user };
}

export async function generateIterationCopy(opts: {
  parentName: string;
  parentCopy: { primary: string[]; headlines: string[] };
  parentDna: CashDna;
  iterationType: IterationType;
  iterationContext: Record<string, unknown>;
  product: ProductFull;
  guidelines: CopywritingGuideline[];
  segments: ProductSegment[];
  generationLanguage?: string;
}): Promise<{ primary: string[]; headlines: string[] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const productBrief = opts.guidelines.find((g) => g.name === "Product Brief")?.content;
  const productContext = buildProductContext(opts.product, productBrief, opts.guidelines, opts.segments);

  const { system, user } = buildIterationPrompt({
    parentName: opts.parentName,
    parentCopy: opts.parentCopy,
    parentDna: opts.parentDna,
    iterationType: opts.iterationType,
    iterationContext: opts.iterationContext,
    productContext,
    generationLanguage: opts.generationLanguage,
  });

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    temperature: 0.7,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });

  const content =
    response.content[0]?.type === "text"
      ? response.content[0].text.trim()
      : "";

  if (!content) throw new Error("No response from AI");

  // Parse JSON — strip markdown fences and surrounding text if present
  let cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
  const lastBrace = cleaned.lastIndexOf("}");
  if (lastBrace >= 0 && lastBrace < cleaned.length - 1) cleaned = cleaned.slice(0, lastBrace + 1);
  const parsed = JSON.parse(cleaned);
  sanitizePrices(parsed);

  const primary: string[] = Array.isArray(parsed.ad_copy_primary)
    ? parsed.ad_copy_primary.filter((s: unknown) => typeof s === "string" && s.length > 0)
    : [];
  const headlines: string[] = Array.isArray(parsed.ad_copy_headline)
    ? parsed.ad_copy_headline.filter((s: unknown) => typeof s === "string" && s.length > 0)
    : [];

  if (primary.length === 0) throw new Error("AI returned no primary text variations");

  return { primary, headlines };
}
