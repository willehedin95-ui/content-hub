# Before/After intensity rework: feature-laddered levels

**Date:** 2026-05-19
**Owner:** William
**Target file:** `src/app/api/assets/before-after/route.ts`

## Problem

The current `subtle` / `moderate` / `dramatic` intensity controls in the Before/After generator do not produce visibly different output. All three levels look roughly the same and the result is consistently "too dramatic" - users cannot dial in a genuinely subtle before/after.

## Root cause

The three `*_INTENSITY_PROMPTS` constants ([route.ts:274-299](../../src/app/api/assets/before-after/route.ts)) differentiate the levels using **adverb modifiers** ("slightly", "marginally", "much") layered onto the same feature list. Diffusion-based image models like Nano Banana 2 latch onto nouns/adjectives that describe concrete visual features and largely ignore magnitude adverbs. The result: regardless of intensity, the model renders the full "tired → rested" delta because all three prompts list the same visual features (smoother texture + more even tone + natural glow + brighter eyes) for the AFTER half.

## Design

Replace the adverb ladder with a **feature ladder**: each intensity level specifies how MANY visual features change between the halves, not how MUCH each one changes.

Lock-in clause: each level explicitly names which features stay IDENTICAL between halves. The "what does not change" constraint is as important as the "what does change" constraint.

### Face / skin (default zones: all non-nails, non-hair_scalp)

| Level | BEFORE features | AFTER features | Identical between halves |
|---|---|---|---|
| **Subtle** | visible undereye shadow / faint puffiness under both eyes | clean undereye area, no shadow | skin texture, pore prominence, skin tone, glow, eye brightness |
| **Moderate** | undereye shadow + faint redness around nose / cheeks + slightly dull tone | clean undereye + clear nose/cheek tone + healthy even tone | pore prominence, glow, eye brightness |
| **Dramatic** | undereye shadow + redness + uneven blotchy tone + prominent pore texture + dull skin | clean undereye + even tone + smoother texture + natural glow + brighter look around the eyes | none beyond what other constraints already lock |

### Nails

| Level | BEFORE | AFTER | Identical |
|---|---|---|---|
| **Subtle** | short, uneven free edge | longer free edge with clean white tip | surface texture, color, shape |
| **Moderate** | short free edge + slightly ridged surface | longer free edge + smoother surface | color |
| **Dramatic** | short, ridged, slightly dull / yellowish | longer, smooth, healthy pink tone | none beyond other constraints |

### Hair / scalp

| Level | BEFORE | AFTER | Identical |
|---|---|---|---|
| **Subtle** | parting line wide (3-4 mm visible scalp) | parting line narrower (1.5-2 mm) | length, color, style, crown volume, no baby hairs in either half |
| **Moderate** | wide parting + flat / limp crown | narrower parting + slight crown volume | no baby hairs in either half |
| **Dramatic** | wide parting + flat crown + no baby hairs + dull strands | narrower parting + crown volume + soft tapered new-growth baby hairs at hairline + subtle natural sheen | length, color, style |

## Prompt structure (template per level)

Each `*_INTENSITY_PROMPTS[level]` value is a short string with this shape:

```
BEFORE half: <feature 1>[, <feature 2>, ...]. AFTER half: <opposite feature 1>[, ...]. The following stays IDENTICAL between halves: <locked feature list>. <Optional reminder about other rules already in place>.
```

No adverbs ("slightly", "marginally", "much") that describe magnitude. Concrete state words only ("visible undereye shadow" vs "clean undereye area", not "less shadow").

## Compatibility / out-of-scope

- Other constraints (mirror-flip prevention, body orientation, no-text, hard_constraints array, body zone framing) remain unchanged
- Per-half outfit / lighting / head angle variation remains unchanged - those are NOT controlled by intensity
- Smile rule (BEFORE always neutral, AFTER may have subtle smile 40% chance) unchanged
- Frontend `INTENSITIES` array unchanged (same three labels, same three values)
- Regenerate route unaffected (does not consume intensity, just takes the existing prompt)
- No DB schema changes (intensity is request-body only)

## Rollback

Single commit. `git revert <hash>` restores prior prompts identically. No data migration, no irreversible side effects.

## Risk / known limitation

The `subtle` level may produce halves that look near-identical at a glance. This is intentional - it is what genuine subtle looks like. Users who want a clearly visible delta should select `moderate`. Re-roll remains the lever for variation within a level.
