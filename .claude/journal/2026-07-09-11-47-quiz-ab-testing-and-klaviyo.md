# Session: 2026-07-09 11:47

Very long session spanning doginwork + a big content-hub feature. Started with a doginwork email-popup copy tweak, moved through quiz analytics + a name-position A/B test, then a full Clarflow reverse-engineering, and ended by building whole-quiz A/B testing into the hub + enriching Klaviyo. Pushed 6 commits: `a6cba663`, `fa182464`, `b13bd44a`, `cd295cda`, `d95150f5`, `aa872b6f` (HEAD == origin/main). Pre-push hook ran build + 240 tests, all green.

## What was done
- **Klaviyo now sends the quiz answers, not just the email** (`/api/quiz/klaviyo-subscribe`). Beyond subscribing the email to the list, it derives the session's answers server-side from `quiz_events` + the quiz spec (no runtime change / republish) and best-effort upserts them as Klaviyo profile properties (`/api/profile-import`) + fires a "Quiz Completed" event (`/api/events`). Also accepts `body.properties` for the fuller set (incl. text inputs) once the runtime sends it. Inert until a quiz actually collects email (William: email-in-quiz is a future test). Unlocks answer-based segmentation.
- **Whole-quiz A/B testing built end to end.** Chosen mechanism (after William rejected two-ad-set split for delivery-imbalance + redirect for cloaking fear): **in-page coin-flip**. A quiz links a Variant-B quiz (`quizzes.ab_variant_quiz_id` + `ab_split_a`, additive DDL); publish bakes BOTH specs into one page (`__QUIZ_AB__`); runtime `index.tsx` coin-flips 50/50 (sticky localStorage `quiz_<A>_ab_<B>`, `?ab=A|B` override), renders the chosen full spec, and stamps the pick into the session's `variant_assignments["ab_<B>"]`. One URL, one ad set, even split, no redirect, no cloaking surface. Verified in a real browser (fresh flip + sticky + both specs render).
  - **Runtime primitives** added earlier same session for the first name-test attempt: `skipAlways` / `skipIfVarSet` navigation gates (`state.ts` resolveNextNode skip-loop, `types.ts`). Kept as general primitives (the whole-quiz approach superseded them for structural tests).
  - **API:** `/api/quiz/[id]/ab-test` (GET status / POST create-as-Variant-B / DELETE end / PATCH split), `/ab-test/results` (per-variant sessions/completion/purchase/revenue + two-proportion z-test from first-party `quiz_sessions`), `/ab-test/promote` (winner; promoting B copies its spec into A so A's URL serves it). Shared resolver `src/lib/ab-test.ts`.
  - **UI:** `AbTestControl` (topbar: "A/B-test" create button -> A|B segmented switcher + Resultat) + `AbTestResults` modal (significance-driven recommendation, editable traffic split, per-variant scoreboard, promote/end). Not clicked-through in a running app (dev app requires login; can't auth autonomously) - typecheck-clean + mechanism browser-verified.
- **Name-position test migrated to the clean structure.** Reverted the earlier in-graph skipAlways hack on the live doginwork quiz (clean Variant A, name at Block 3). Created Variant B `2ce2ce4e-e4b6-4a5d-b58f-dc4ca2c34d77` "Valpakademin (Variant B - namn sist)" with the name step moved natively to before Profil (3 edge redirects, no tricks). Linked 50/50, published via local script, **verified live**: `?ab=A` shows name after Ras, `?ab=B` skips to Block 9. Pre-migration backup in scratchpad.
- **Doginwork email popup options** (first task, doginwork-side): recommended replacing the 3 problem-buttons with age brackets (data showed the 3 buttons covered ~56% of quiz problems and missed the #2, hyperactivity 20%). William applied it.

## Decisions made
- **Structural A/B = whole-quiz duplication, not in-graph.** Confirmed against Clarflow (their A/B is per-question only; they don't do structural). Matches the `page_tests` philosophy but split in-page (not ad-set) per William's concerns.
- **Split in-page, not two ad sets / not redirect.** Two ad sets risk Meta starving one variant; redirect risks cloaking flags (cross-domain / UA-branching). In-page coin-flip sidesteps both.
- **Klaviyo v1 = server-side answer derivation on the existing per-workspace env key.** Connection UI (pasted key vs OAuth) deferred; leaning pasted-key first.
- The hub **already had per-node (content) A/B** (createVariant/VariantControls) - it was just buried; whole-quiz A/B is the net-new structural lane.

## Current state
- All 6 commits pushed to main (`aa872b6f`), Vercel auto-deploying. Runtime `dist` bundle is git-tracked, so committed the rebuilt bundle (`DMjoi_uw`) too.
- Name A/B is live on doginwork via the new structure (50/50). Measure via `variant_assignments->>'ab_2ce2ce4e-...'` or the Resultat modal once the deploy lands.
- Klaviyo enrichment live but inert until a quiz collects email.

## Blockers / Open questions
- A/B editor UI not exercised in a running app (couldn't log into dev). William can click-test once the Vercel deploy lands.
- Klaviyo needs one live smoke test (a real quiz email submission) whenever email capture is added - avoided firing test data into Marie's live Klaviyo.

## Next up
1. William: click-test the A/B control + Resultat modal in the deployed app.
2. ~1 week: pull the name-test A-vs-B read (completion + purchase per variant).
3. Later: Klaviyo connection UI (pasted key -> OAuth), and content A/B polish (surface the existing per-node variant UX, on-canvas analytics overlay).
