# Quiz Funnel Knowledge Base

Compressed reference for writing and adapting high-converting DTC quiz funnels.

This folder exists to be **read by Claude during quiz adaptation** and by humans editing prompts. Every doc is tight, concrete, and claim-backed — no fluff.

## Files

- `00-foundation.md` — Why quiz funnels work. Self-Generated Persuasion, Micro-Confessions, Gradualization, Salience, Pressure Management.
- `01-principles.md` — The 15 psychological and technical principles every quiz must respect.
- `02-arc-and-phases.md` — The three arc frameworks. Use as scaffolding when ordering questions.
- `03-question-library.md` — Question archetypes with prompts and examples. Swap content, keep structure.
- `04-patterns.md` — Interstitials, loading screens, profile trifecta, commitment gates, competitive destruction slides.
- `05-teardown-lessons.md` — Compressed tactical lessons from live funnels (Spoiled Child, Lunavia, HikeFootwear, Javvy, Liven, Welcome Baby, Mars Men, Seranova, Happy Mammoth, Nutrops, Primal Viking, Hollow Sox, Inflow).
- `06-adaptation-guide.md` — Step-by-step on adapting an imported competitor quiz to your product + market. The main system prompt for the AI lives here.

## Usage in code

`index.ts` exports each doc as a string constant and a concatenated `FULL_KNOWLEDGE` for prompting.

```ts
import { FULL_KNOWLEDGE } from "@/lib/quiz-knowledge";
// Pass as part of Claude system prompt when adapting a quiz.
```

## Update policy

When new teardowns arrive: add to `05-teardown-lessons.md` with the pattern name + what's stealable. Keep each entry under 15 lines.

When the user shares new principles: extend `01-principles.md` or `04-patterns.md`. Do NOT create new files unless the category is genuinely new.

## Sources

- Alen Sultanic — Crafting Quiz Funnels framework
- Clarflow Why Quiz Funnels deck (12 psychological + 3 technical principles)
- 12 X teardowns from @DTC_Quizbuilder
- Eugene Schwartz — market sophistication, gradualization
- Cialdini — commitment and consistency, micro-commitments
