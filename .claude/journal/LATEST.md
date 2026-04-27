# Session: 2026-04-22 / 23 - Hydro13 iOS onboarding polish + QA infrastructure

**Project**: Hydro13 iOS (NOT content-hub). Logged here per central journal convention.

Long 2-day session focused on v1.1.0 onboarding redesign, visual polish bugs, and an overnight QA agent run that produced mixed results.

## What was done

### Day 1 (2026-04-22)

**Onboarding v1.1.0 redesign (commit `b86cbb1`)**
- Welcome: fixed warmBackground seam, removed 'Hoppa intro', standardized CTA style, unclipped truncated body text
- TooEarly: replaced horizontal timeline with AI-generated before/after split image (dag 0 / dag 60 chin area, stored in `Hydro13/Assets.xcassets/BeforeAfterSplit.imageset/`), clean typography, no more bounce animation
- AgeRoutineSlide: simplified to age-only big cards (removed Hudvårdsrutin section entirely)
- OnboardingTimelineSlide: converted from horizontal scroll to vertical list with connecting lines
- SocialProofSlide: removed 'Typiska användarupplevelser' disclaimer
- OnboardingView: dropped PurchaseSetupView from flow, 10 steps → 9
- PurchaseSetupView: removed date picker collapsible (file kept for future Settings-edit)
- Skin feel sheet → inline SkinFeelCard on Home (no more post-dose modal hijack)
- Challenge simplification 5-tier → 2-tier (already in working tree from earlier session)

**Overnight QA run v1 (HYD-217)**
- Created Paperclip QA master issue with 83-scenario checklist
- QA agent ran ~70 min, marked 59/83 checked, filed 3 bug issues (HYD-218 Journey scroll, HYD-219 broken tests, HYD-220 logDoseButton inaccessible in XCTest)
- HYD-218 was auto-fixed by iOS Engineer agent during the run

### Day 2 (2026-04-23)

**Morning fixes (commits `7b7723b`, `5f2336e`)**
- HYD-220 root cause found via accessibility-tree dump: three separate issues, NOT just `.opacity(appearCards)`:
  1. `.accessibilityIdentifier("homeTab")` on HomeView() bled down to descendant Buttons, overwriting `logDoseButton` identifier. Removed tab-level identifiers from ContentView
  2. Notification permission dialog race with `addUIInterruptionMonitor`. Guarded with `--uitesting` check in both `NotificationManager.requestPermission` and `ReminderSetupView.requestNotificationPermission`
  3. ProfileQuestionsPrompt overlay showed after skip-path. Guarded `checkProfileQuestions()` with `--uitesting` check
- Test pass rate went from 17/34 → 29/34 after fixes (remaining 5 are brittle QAContinuationTests)
- HYD-221 (medical claims): softened 'visar'/'bevisar' → 'tyder på' in Milestone.swift, DagensInsiktStore.swift, JourneyView.swift

**Analytics gaps (commit `9879805`)**
- Added 9 new events: skinFeel.logged, challenge.accepted/dismissed, returnFlow.shown/logged, streak.milestone, settings.reminderChanged/dataReset, dose.retroLogged
- Wired previously-declared-but-unused `notification.permissionResult`
- Cohort segmentation: `Analytics.setUserProperties` populates TelemetryDeck defaultParameters (primaryGoal, ageRange, purchaseType, currentRoutine) - applied to every signal automatically
- Test-mode: `#if DEBUG` + `--uitesting` force `testMode=true` so QA/dev signals stay out of production metrics
- Rehydration on cold launch from UserProfile

**TestFlight attempted upload (failed)**
- Apple returned `FORBIDDEN.REQUIRED_AGREEMENTS_MISSING_OR_EXPIRED`. User to sign agreement in App Store Connect → user said they signed later but we didn't retry yet
- Build + archive succeeded, only export/upload failed

**Additional onboarding polish**
- TooEarlySlide: replaced spring(bounce) with easeOut - user flagged bounce as inconsistent with other slides (commit `3dbd0a2`)
- Combined OnboardingTimelineSlide + ChallengeSlide into one: 60-day ring + timeline, 'Jag är redo' CTA, fade-gradient above sticky CTA (commit `3dbd0a2`)
- SkinFeelCard emoji rendered as `[?]` tofu glyphs on iPhone 17 iOS 26.3 simulator. Swapped Text(emoji) for Image(systemName:) SF Symbols (face.smiling.fill, face.dashed, face.dashed.fill) - commit `aef5cb7`
- ReminderSetupView 'Påminn mig senare' no longer triggers permission dialog (was triggering it, opposite of intent). 'Börja resa' awaits permission response before transition using async/await - commit `aef5cb7`
- Removed entire ProfileQuestionsPrompt + ExistingUserProfileFlow + supporting state/helpers. User found it intrusive (popped up instantly after skip-onboarding). Settings already has 'Min profil' section for same data (commit `201ff74`)

**Overnight QA run v2 (HYD-224) - BURNED, cancelled**
- Created new master plan with lessons from HYD-223 (QA process gap): require simctl erase at start, screenshot every interaction state, verify badges visually, fix HYD-220 first
- Multiple auth failures hit us:
  1. First attempt: Paperclip inherited `CLAUDECODE=1` from my Claude Code session → spawned subprocess saw nested-check, refused with "Invalid authentication credentials"
  2. Fixed by restart with `env -u CLAUDECODE` - but this also stripped `CLAUDE_CODE_OAUTH_TOKEN` → 23 min run then auth-cache expired
  3. Fixed by restart with `CLAUDE_CODE_OAUTH_TOKEN="$TOKEN"` explicit - agent ran ~30 min, managed to get to Step 1 av 7 TooEarly slide
  4. Agent booted iPhone 17 Pro instead of iPhone 17 → SwiftData schema mismatch from old simulator data → 4 crashes of Hydro13 in sequence (18:05-18:07). Shut down + erased iPhone 17 Pro
  5. After 90+ min cumulative claude-max token burn, 0/62 scenarios checked, 0 bug issues filed
- Cancelled HYD-224, killed Paperclip + caffeinate + keepalive

## Decisions made

1. **Swapped emoji for SF Symbols in SkinFeelCard** - iOS 26.3 simulator has intermittent emoji-font-loading bug. SF Symbols more reliable, respect Dynamic Type + dark mode, tint to brand colors. Decided NOT to do same for Badges yet (need real-device verification first) - tracked in HYD-223.

2. **Removed profile-questions auto-popup entirely, not just delay** - user rage at getting nagged instantly after skip. Settings → Min profil already exists for same edits. Net -205 lines of dead code removed.

3. **Combined challenge + timeline slides into one** - user flagged they said same thing differently. Kept 60-day ring visual for wow-factor, added timeline below, scroll-if-needed + fade-gradient above CTA to signal scroll.

4. **Abandoned Paperclip QA overnight approach** - claude_local adapter too fragile for long-running interactive sessions. Auth keeps breaking in subtle ways, and agent burns tokens on retries without measurable progress. Going forward: manual user testing + chat-triggered spot-fixes + `xcodebuild test` XCUITest suite for regression. Documented in HYD-223.

## Current state

**Shippable commits on main (not pushed to TestFlight yet):**
- `b86cbb1` Onboarding v1.1.0 redesign
- `284c58c` Challenge simplification 5→2 tiers
- `056355a` Skin feel sheet → inline card
- `7d57a1b` XCUITest align to v1.1.0 + QAContinuationTests
- `7b7723b` HYD-220 unblock XCUITest (accessibility + permission + overlay fixes)
- `5f2336e` HYD-221 soften medical claims
- `9879805` Analytics gaps filled + cohort segmentation + test-mode
- `3dbd0a2` Combine timeline + challenge, 8→7 steps, remove bounce
- `aef5cb7` SkinFeelCard SF Symbols + reminder permission timing
- `201ff74` Remove profile prompt + dead code

Plus existing pre-session:
- `3dfba8a` HYD-218 Journey auto-scroll fix (from QA v1 overnight)

**TestFlight:** App Store Connect agreement signed by user but we haven't retried upload. Build at version 14.

**Paperclip QA:** Infrastructure dead. Master HYD-224 cancelled. Don't restart unless we have a better auth-stable approach.

**XCUITests:** 29/34 passing. Remaining 5 are brittle QAContinuationTests (scroll-timing + compound accessibility labels). Tracked in HYD-222.

## Blockers / Open questions

- **TestFlight upload** pending retry after agreement signature
- **Apple Developer Organization conversion** (Incensor AB) - user has started planning, D-U-N-S-lookup pending. Guide given but user handling async
- **HYD-222** flaky QAContinuationTests (5 Journey/Settings tests with scroll-position and compound-label issues)
- **HYD-223** QA process improvements (screenshot every interaction state, erase sim upfront, real-device smoke test)
- **Day-60 selfie prompt** deliberately suppressed in HomeView.swift:725 - subagent flagged as potential bug OR intentional (user never gave verdict)
- **Badges emoji rendering** on real device - unverified. If same `[?]` bug as SkinFeelCard, swap to SF Symbols

## Next up

1. Retry TestFlight upload: `bash scripts/upload-testflight.sh --force`
2. When live: smoke-test v1.1.0 onboarding + SkinFeelCard + reminder permission on real device
3. If Badges show `[?]` on real device: swap emoji → SF Symbols (~30 min)
4. Manual onboarding sweep to catch remaining UX issues before Apple review
5. Apple Developer Org enrollment for Incensor AB (user async)
