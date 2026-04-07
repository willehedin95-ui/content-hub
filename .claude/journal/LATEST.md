# Session: 2026-04-07 14:00

## What was done
- Fixed two related production bugs surfaced by a swiped Hälsobladet ad: Swedish copy showed EUR prices ("387 €" / "150 €") and the HappySleep pillow looked completely wrong (muted sage grey instead of white quilted with black mesh).
- **Bug 1 — EUR prices in ad copy**:
  - Added a **NO PRICES** rule to `src/lib/brainstorm.ts` in both `OUTPUT_INSTRUCTIONS` (line ~793, used by from_scratch + from_organic) and `buildFromCompetitorAdSystem` CRITICAL RULES (line ~1340). Default behaviour: write the entire ad with no prices at all. Only exception: if the competitor's hook hinges on a specific price, you may keep it but **only in SEK** — never EUR/USD/GBP.
  - Added a **CURRENCY conversion rule** directly to `src/app/api/image-jobs/[id]/translate-copy/route.ts` and `src/lib/autopilot-translations.ts` — these are the actual ad-copy translation paths in production and they have hardcoded prompts that bypass `translation-rules.ts`. Rule includes rough rates (1 EUR ≈ 11 kr SE/NO, 7.5 kr DK; 1 USD ≈ 10 kr SE/NO, 7 kr DK) and rounding instructions (€387 → 4 200 kr, not 4 257 kr).
  - Also added the matching CURRENCY rule to `src/lib/translation-rules.ts` and updated all 4 `src/lib/openai.ts` SYSTEM_PROMPTS (EN/SV/DA/NO) — these handle landing page translation via `translateFullHtml`. Replaced the old "Do not change numbers/doses/prices — only format locally" wording which was actively suggesting to leave foreign currency in place.
- **Bug 2 — HappySleep wrong appearance in autopilot images**:
  - Wired `getProductAppearance()` into all three remaining call sites that were missing it: `src/app/api/cron/autopilot-concepts/route.ts`, `src/lib/autopilot-iterate.ts`, and `src/app/api/image-jobs/[id]/re-roll/route.ts`. The manual `generate-static-images.ts` path already had it.
  - Without the productAppearance anchor text, Claude was inventing descriptions like "muted sage grey fabric" that overrode the reference image when Nano Banana built the prompt.
- Verified: typecheck clean, build green, 27 tests passing.
- Single commit `2866a73` pushed to `origin/main`. Vercel will auto-deploy.

## Decisions made
- **One commit, not two**: The two bugs surfaced from the same user report (one buggy ad showing both symptoms) and both fixes are small + low-risk. Splitting would just add overhead.
- **Add the currency rule directly to the hardcoded translation prompts**, not just to `translation-rules.ts`. The shared rules file is **not** consumed by the ad-copy translation paths — both `translate-copy/route.ts` and `autopilot-translations.ts` build their system prompts inline with no reference to `formatRules()`. So shared rules only fix landing page translation. Keeping the rule duplicated in both inline prompts is the only way to actually patch the bug.
- **Default to NO prices in ad copy** rather than trying to teach the LLM how to handle prices correctly. Prices in ad creatives date the ad, break on promotions, and fragment across markets. Pricing belongs on the landing page.
- **Keep the price exception narrow**: only when the competitor's *hook* hinges on a specific number (e.g. "I spent X on Y"). Even then, must be SEK. This preserves the "I spent 4 200 kr on three pillows" hook angle but kills the EUR leak.
- **Did NOT add Klaviyo/Shopify/email translation rules** — those paths use different prompts and aren't part of the ad pipeline. Out of scope for this fix.

## Current state
- ✅ Commit `2866a73` pushed to `origin/main`, Vercel auto-deploying.
- ✅ Build green, tests green (27 passing), typecheck clean.
- ✅ All 8 callers of `generateImageBriefs` now pass `productAppearance` (verified via grep).
- ✅ Both ad-copy translation prompts have the CURRENCY rule.
- ✅ All 4 openai.ts SYSTEM_PROMPTS updated.
- ⚠️ Working tree still has `.claude/journal/LATEST.md` + `.claude/tasks/backlog.md` modified (this journal update) and `supabase/.temp/cli-latest` (CLI version stamp, pre-existing).
- ⚠️ Untracked: 5 old journal files, `.claude/launch.json`, `.superpowers/`, `test-results/` — pre-existing, not part of this session.

## Important context for next session
- **"The Pillow Paradox" was NOT a real competitor swipe**. User initially thought it was. DB check showed `cash_dna.ad_source = "Wildcard"` and `source_spy_ad_id = NULL` — it was actually generated via autopilot **from_scratch** mode. The "I spent €387 on three ergonomic pillows" hook was invented from thin air by the LLM. There is no original competitor ad to look at.
- **The custom translation prompts in `translate-copy/route.ts` and `autopilot-translations.ts` bypass `translation-rules.ts` entirely**. This is a recurring footgun — any new shared translation rule (like the currency one) needs to be manually added to **both** of those inline prompts as well, or it won't affect ad copy translation. Worth refactoring eventually so all translation paths use one shared prompt builder.

## Blockers / Open questions
- None. Both fixes are shipped and verified.

## Next up
1. **Watch the next autopilot run** (cron at 08:00 UTC tomorrow) to confirm new HappySleep concepts use the correct white quilted appearance instead of "muted sage grey".
2. **Watch the next translation run** to confirm no foreign currency leaks. If a price slips through, the corrections retry loop should catch it now.
3. **Backlog**: Whatever was on the backlog before the cleanup-empty-adsets session and this fix. Both have been one-shot fixes.
4. **Refactor opportunity** (low priority): Consolidate the two hardcoded ad-copy translation prompts into one shared builder that uses `translation-rules.ts`. Would prevent the next "added shared rule but it didn't fix ad copy" surprise.
