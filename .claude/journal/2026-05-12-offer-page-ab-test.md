# 2026-05-12 - Offer page A/B test (Maries Valpakademin)

## What was built

A/B test of the quiz offer page (`step_1777927539583_lhvtzvnx` = "Offer page", new sibling `step_1778588267757_offerb` = "Offer page (B variant)") in variant group `vg_1778588267757_offerab` at 50/50 traffic split.

Triggered by funnel-data showing 4.9% completion-to-purchase (FP target 10%+). Drop-down breakdown: of 104 sessions reaching offer page, only 9 click CTA (8.7%); of those 9, 5 buy (55.6%). Bottleneck is the offer page itself, not Shopify checkout.

## Infrastructure that works (don't touch)

- `vg_1778588267757_offerab` variant group with both A and B at trafficPct: 50
- Edge B → exit "Tack" (which redirects to `cart/50917157765463:1?discount=QUIZ2026`)
- `runtime/quiz-runtime/src/state.ts`: existing variant resolver picks via weightedPick; ignores stored localStorage assignment if trafficPct=0 (added earlier this session)
- `runtime/quiz-runtime/src/App.tsx`: `?goto=Offer page (B variant)` forces variant assignment to B for testing without manual localStorage manipulation
- `runtime/quiz-runtime/src/App.tsx`: parent OfferTimerBar suppressed for any step name matching `/\(.*variant.*\)/i` so B variant doesn't get the fake countdown
- `runtime/quiz-runtime/src/renderer.tsx`: added fallbacks for `age`, `age_value`, `gender`, `gender_value` so interpolated copy doesn't break for users who skipped questions
- Analytics UI (`src/app/quizzes/[id]/analytics/AnalyticsClient.tsx`): per-variant funnel charts already render split data automatically when both variants accumulate

Commits:
- `09642dc` (William): includes my runtime fallbacks and OfferTimerBar exclusion
- `44276e3` (mine): goto exact-match + force variant assignment

## What's actually pushed/live

- B variant HTML in DB (~22KB custom_html), live since 12:36 UTC
- All runtime changes pushed to main → Vercel auto-deployed

## What William specifically rejected (so next LLM has the diff)

William reviewed the rendered B variant at `?goto=Offer page (B variant)` and listed 6 concrete failures. My design instinct was to shorten/strip the page; his instinct is that the visual richness of the original is what carries conversion, and stripping it makes the page feel cheap. He's right.

**Fixes needed for B variant (next LLM should address all):**

1. **Testimonials**: I replaced the original before/after photo cards (Bella, Loke, Sigge) with plain text quote-boxes. William wants the photo before/after cards back. The original `.v20-app` offer page in A variant has the implementation - reuse that pattern.

2. **QUIZ2026 coupon box looks cheap.** William wants it to match the original A variant's coupon styling (which is a more prominent box inside the orange-bordered DITT ERBJUDANDE section, not a standalone dashed-border pill).

3. **"Möt din coach"-section is too understated.** Currently it looks like one of the 4 module cards. William wants the original A variant's bigger/stronger Marie section back - photo + credentials display + the full story (kortvariant blandar in den för mycket).

4. **Bonus images stripped to emojis.** I replaced original product/icon imagery with emojis (📋💬🏆🎧). Bring back the proper images for each bonus. Original A variant offer has them in CSS-bg-image or `<img>` form - reuse.

5. **Final offer box (pricing section)**:
   - Ordinarie pris 1 999 kr is **missing** from B variant final pricing block - only shown in the hero. Needs to be back in the final box as struck-through anchor.
   - Box itself looks "mindre tilltalande" - probably means it needs the full value-stack visual treatment from A variant (Hela Valpakademin + 4 bonusar + Totalt värde row with strike-through, then specialpris reveal).

6. **30 dagars garanti badge**: I replaced the actual gold "100% PENGARNA TILLBAKA 30 DAGAR GARANTI" badge image with a shield emoji 🛡️. Bring back the original badge image.

## How to do the fixes

The original A variant HTML lives in `data.nodes['step_1777927539583_lhvtzvnx'].subEls[0].html`. To inspect:

```bash
curl -s "https://api.supabase.com/v1/projects/fbpefeqqqfrcmfmjmeij/database/query" \
  -H "Authorization: Bearer <token-from-MEMORY.md>" \
  -H "Content-Type: application/json" \
  -d '{"query":"select jsonb_path_query(data, '"'"'$.nodes.* ? (@.id == \"step_1777927539583_lhvtzvnx\")'"'"') as offer_page from quizzes where id='"'"'29dd6398-51b7-46aa-8f3a-92b455d18cb7'"'"';"}'
```

Patch the B variant via PostgREST PATCH on `/rest/v1/quizzes?id=eq.<quiz_id>`. Example script pattern:

```python
# Load fresh quiz data
# Modify data["nodes"]["step_1778588267757_offerb"]["subEls"][0]["html"]
# PATCH with {"data": data}
```

After DB patch, run `npx --yes -p dotenv-cli@7 dotenv -e .env.local -- npx tsx scripts/publish-doginwork-quiz.ts` to publish.

## Important constraints

- DON'T modify product copy (I made the mistake of changing "Hantering" to "Koppelträning" in a bullet - reverted).
- DON'T edit A variant (that's the control).
- All CTAs must keep class `.v21-cta` and call `continueToCheckout()` so the postMessage → exit-step → Shopify redirect flow still works.
- Variant runtime swap only fires on navigation - `?goto=Offer page (B variant)` URL forces the assignment in App.tsx (committed in 44276e3).
- The dynamic deadline JS (`formatDeadline()` for today+2 in DD/MM/YYYY) is working and should stay.
- The age-conditional urgency text (0-3 / 4-6 / 7-12 mån via CSS class is-young/is-mid/is-late) is working and should stay.

## Test URLs

- A variant: https://quiz.doginwork.se/valpakademin/?goto=Offer%20page
- B variant: https://quiz.doginwork.se/valpakademin/?goto=Offer%20page%20(B%20variant)

Both now work correctly thanks to exact-match + force-variant fix in 44276e3.

## Earlier work in this session (already shipped + done)

- Renamed "Quiz Starts" → "Sessions" in analytics, added Cart Conversion Rate KPI card (commit `4234731`)
- Split Funnel Drop-off chart per variant when "All variants" filter (earlier commit)
- FP knowledge base saved to `~/.claude/projects/-Users-williamhedin-Claude-Code/memory/funnel-professor/` (24 articles + master index)
- Added Obsidian + Hermes migration plan to `.claude/tasks/backlog.md` (deferred per William)

William explicitly asked another LLM to take over the offer-page B variant polish work after frustration with my design choices. The infrastructure works; the visual decisions need redo.
