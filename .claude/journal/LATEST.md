# Session: 2026-04-09 09:30

## What was done

**Critical incident: Hydro13 #101 The Mirror Test was wrongly killed by autopilot-execute cron. Reactivated immediately and shipped a fix with two new bleeder guards.**

### 1. Incident: wrongly killed Hydro13 winner

User opened Meta Ads Manager angry in Swedish: "varför har du stängt av hydro13 på meta när den presterade hur jävla bra som helst igår?"

Screenshot showed `#101 The Mirror Test` ad set + 3 ads all toggled OFF, but yesterday's stats (Apr 8) were:
- Purchase ROAS: **7.55**
- Purchases: **3**
- Frequency: 1.11
- CPM: kr 174.07

### 2. Root cause analysis

Queried `autopilot_actions` to find the kill event:

```
id: b7edc628-...
action_type: kill_adset
target_id: 120236891068240336
target_name: #101 The Mirror Test
details.urgency: critical
details.reasoning: "These ad sets have spent 200+ SEK with zero purchases after the 4-day testing window."
recommendation_title: "Hydro13 SE: 1 bleeding ad set(s) — 582 SEK wasted"
created_at: 2026-04-08 07:20:31+00  (09:20 STHLM)
workspace_id: 6a18a542  (Hydro13)
```

Queried `meta_adset_performance` for history of adset `120236891068240336`:
- Mar 20 to Mar 31: **14 purchases** in total (historical winner)
- Apr 1-4: 0 spend (ad set was paused)
- Apr 5-6: 0 spend (still paused)
- Apr 7: **584.79 SEK spent, 0 purchases** (1 bad day after restart)
- Apr 8: 395.48 SEK spent, **3 purchases, 7.55 ROAS** — but this was already live WHILE the cron ran

The `buildAdSetBreakdown` function in `src/lib/strategy-engine.ts` uses `daysAgo >= 1` which **excludes today's data** — so at 09:20 STHLM on Apr 8, the cron only saw Apr 1-7. Only Apr 7 had activity in that window. The old rule was:

```ts
} else if (a.spend_7d >= BLEEDER_SPEND_THRESHOLD && a.purchases_7d === 0) {
  status = "bleeder";
}
```

`spend_7d = 584.79 >= 200` and `purchases_7d = 0` → flagged as bleeder → autopilot-execute killed it. Historical ROAS, active days count, and today's running performance were all ignored.

### 3. Immediate fix: reactivated everything via Meta API

```
PAUSED → ACTIVE:
- adset 120236891068240336 (#101 The Mirror Test)
- ad 120236891068250336 (Bild 1)
- ad 120236993764680336 (Bild 2)
- ad 120236993764690336 (Bild 3)
```

Verified all four are back `IN_PROCESS` (delivering) via `/insights` + `effective_status`.

### 4. Code fix: two new independent bleeder guards (commit `289e8e8`)

Modified `src/lib/strategy-engine.ts`:

**New constant:**
```ts
const BLEEDER_MIN_ACTIVE_DAYS = 3;
```

**`AdSetBreakdown` interface — new fields:**
```ts
active_days_7d: number;
purchases_30d: number;
```

**`buildAdSetBreakdown` changes:**
- Extended performance query window from 7 days to 30 days
- Added `adsetPurchases30d` Map to track historical purchases per ad set
- Added `active_days_7d` counter (counts days where `spend > 0` in the 7d window)

**New bleeder classification (4 conditions, all required):**
```ts
} else if (
  a.spend_7d >= BLEEDER_SPEND_THRESHOLD &&      // (1) significant spend
  a.purchases_7d === 0 &&                       // (2) no purchases in window
  a.active_days_7d >= BLEEDER_MIN_ACTIVE_DAYS && // (3) 3+ days of actual activity
  purchases30d === 0                            // (4) no historical purchases
) {
  status = "bleeder";
}
```

The two new guards independently protect against:
- **(3) active_days_7d >= 3**: prevents killing on 1-2 bad days after a pause/restart (e.g. Apr 7 only)
- **(4) purchases_30d === 0**: protects historical winners that had one bad week (Mirror Test had 14 purchases Mar 20-31)

Either guard alone would have prevented the Mirror Test kill.

### 5. Verified, committed, pushed

- `npx tsc --noEmit` — clean (only pre-existing unrelated error)
- Checked `MorningBriefClient.tsx` — has a duplicate interface declaration, but extra JSON fields are ignored client-side, so no update needed there
- Commit `289e8e8` — "fix(autopilot): protect historical winners + require 3+ active days before bleeder kill"
- Pushed to main, deploy succeeded

### 6. Documentation

- Updated `MEMORY.md` — appended "Bleeder guards" note to the Strategy Guide section with incident summary and "NEVER remove these guards" warning
- Created journal entry `2026-04-09-session1.md`

## Decisions made

- **Go with two guards instead of one**: Either `active_days_7d >= 3` or `purchases_30d === 0` alone would have saved Mirror Test, but making BOTH required makes the rule robust against future edge cases. A real bleeder will fail both conditions (spent for 3+ days AND no historical purchases).
- **Don't touch the `daysAgo >= 1` window**: Including today's data would make the rule react to intra-day noise. The fix is in the guards, not the window.
- **Accept the tradeoff**: New guards mean a genuinely bad ad set has to bleed for at least 3 days (not 1) before being killed. At 200 SEK/day, that's ~600 SEK wasted before autopilot can act. Acceptable — we'd rather lose 600 SEK than kill a winner.

## Current state

**Working:**
- Production deploy: `289e8e8` live on Vercel
- Hydro13 #101 The Mirror Test: ACTIVE, all 3 ads ACTIVE, delivering normally
- Bleeder rule now requires 4 conditions (was 2)
- Autopilot-execute's 7-day kill dedup also protects Mirror Test from being re-killed this week as a secondary safety net

**No other winners at risk:** The query showed only one kill action for the day — Mirror Test was the only victim of the old rule.

## Blockers / Open questions

- **Should we add a post-kill sanity check?** Before autopilot-execute actually pauses an ad set, it could query Meta's live insights for today's data. If today shows purchases, skip the kill. This would be a belt-and-braces check on top of the new guards. Worth considering if another incident slips through.
- **Should `auto-pause-bleeders` (ad-level) get similar guards?** That cron uses `signals.bleeders` from morning-brief which has a 4-day cooldown but doesn't check historical purchases or active days. It pauses individual ads, not ad sets, so the blast radius is smaller — but worth reviewing.
- **Monitor autopilot-execute logs tomorrow** to make sure the new 30d window query doesn't blow the 300s budget. 30d × ~10 ad sets per workspace × 3 workspaces = ~900 rows fetched, should be trivial.

## Next up

1. **Watch tomorrow's 07:00 UTC autopilot-execute run** — confirm no false positives with the new rule, verify query performance stays well under 300s budget.
2. **Consider auditing historical `autopilot_actions`** for other concepts that might have been wrongly killed over the past 30 days (same pattern: historical winner, paused, restarted, killed on first bad day).
3. **Consider adding today's live Meta insights** as a final safety check before pausing (see blocker above).
