# Session: 2026-03-22 (session 1)

## What was done
- **Activity Feed homepage**: Replaced Business Pulse/Daily Actions with lightweight Activity Feed. New API at `/api/activity-feed` queries `autopilot_actions` + autopilot `image_jobs`/`video_jobs`. Grouped by date (Today/Yesterday/date), icons per action type, relative timestamps, clickable links.
- **Auto-iterate fatiguing concepts**: New `src/lib/autopilot-iterate.ts` — detects winning concepts with frequency > 2.5 or CTR drop ≥ 20%, generates 3 fresh images using same CASH DNA/style, sends Telegram approve/reject. On approve, triggers translation + push pipeline. On reject, cleans up iteration images. Integrated into autopilot-execute cron with `autopilot_auto_iterate` toggle.
- **Better Telegram concept notifications**: Added `sendMediaGroup()` to telegram.ts. Both from-scratch and swipe concepts now send ALL generated images as Telegram album (not just first), include primary text + headline in caption. Approve/Reject buttons sent as separate follow-up message (Telegram limitation: no keyboards on media groups).
- **Reduced Telegram notification overload**: Removed 3 redundant morning brief follow-up messages (budget shift buttons, winner graduation buttons, strategy kill buttons) — all handled by autopilot-execute now. Suppressed auto-pause-bleeders Telegram notifications (duplicate of autopilot-execute digest). Reduces daily messages from ~8-10 to ~3-5.
- **Multiple GetHookd board IDs per workspace**: Changed from single `gethookd_board_id` to `gethookd_board_ids` array. UI has dropdown selector with tag chips. Backward compatible migration in settings load.
- **Autopilot action logging**: Added `autopilot_actions` inserts to all concept/video approve/reject handlers (Telegram webhook + Hub UI) for the Activity Feed.
- **Sidebar cleanup**: Removed Daily Actions, renamed Dashboard to "Activity" with Radio icon.

## Decisions made
- **Media group + separate buttons**: Telegram doesn't support inline keyboards on media groups, so we send images as album then a separate "Approve concept #N?" message with buttons.
- **Keep morning brief text, remove action buttons**: The morning brief KPI summary is still valuable for passive monitoring. Only removed the 3 follow-up action messages that required manual intervention (now automated).
- **Webhook handlers kept for old buttons**: Didn't remove budget_apply_all/graduate_all/strategy_kill_all handlers from webhook — old messages still work if tapped.

## Current state
- All changes committed (fa70b3c), NOT pushed. TypeScript passes.
- Activity Feed is the new homepage at `/`
- Auto-iterate is behind `autopilot_auto_iterate` toggle (defaults to false)

## Blockers / Open questions
- `concept_metrics` table needs data for auto-iterate to work — verify table exists and is populated
- Media group approve edits a plain text message (not photo caption) — works correctly

## Next up
1. Push to Vercel when user is ready
2. Test full flow: autopilot concept → Telegram album → approve → translation → push
3. Consider merging morning brief + autopilot-execute into single daily digest
4. Video ad swipe notifications could benefit from album treatment
