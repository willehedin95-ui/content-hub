# Auto-Schedule Queue — Design Doc

> Date: 2026-02-27
> Status: Approved
> Location: `/pipeline` (replaces draft column)

## Problem

After creating ad concepts, the user must manually decide when to push them to Meta and click "Push to Meta" at the right time. This creates cognitive overhead and delays. The user wants to focus only on the creative work — make concepts, mark them ready, walk away.

## Solution

Replace the "Draft" column in the pipeline with a "Queued" column. When the user finishes a concept, they add it to the queue with one click. A daily cron job automatically pushes queued concepts to Meta when testing slots are available. Telegram notifications report success or failure.

## Design Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Queue ordering | FIFO by queued_at | Simple, predictable, fair |
| Slot management | Per product | A concept gets pushed to all countries simultaneously |
| Auto-push trigger | Vercel Cron (daily at 03:00 UTC) | No infra needed, existing pattern |
| Notifications | Telegram (reuse existing bot) | Already integrated for Ad Spy |
| Default testing slots | 5 per product | Good balance for testing budget |
| Push logic | Extract into shared lib function | Both API route and cron can call it |

## Pipeline Stages (Updated)

```
Draft (lives in Ad Concepts page)
  → Queued (user marked as ready, waiting for testing slot)
    → Testing (pushed to Meta, 7-day learning period)
      → Review (7+ days, being evaluated)
        → Active (CPA below target, scaling)
        → Killed (underperformer or fatigued)
```

The pipeline dashboard shows: **Queued → Testing → Review → Active → Killed**

Drafts (completed image_jobs not yet queued) are browsable via an "Add to Queue" picker in the pipeline header.

## Data Model Changes

### Type change
- `PipelineStage`: `"draft" | "queued" | "testing" | "review" | "active" | "killed"`

### New column on `pipeline_settings`
- `testing_slots` integer, default 5 — max concepts in testing per product

### New env var
- `TELEGRAM_NOTIFY_CHAT_ID` — user's Telegram chat ID for push notifications

### No new tables
Queue is tracked via `concept_lifecycle` with `stage = 'queued'`. Queue order = `entered_at ASC`.

## Queue Logic

1. User marks concept as "ready" → `concept_lifecycle` record created with `stage = 'queued'`
2. Cron runs daily at 03:00 UTC
3. For each product:
   a. Count concepts currently in "testing" stage
   b. Look up `testing_slots` from pipeline_settings (default 5)
   c. Available = testing_slots - current testing count
   d. If available > 0: push the oldest queued concept(s) to Meta
   e. Transition from "queued" → "testing"
4. On push success: Telegram "Pushed #N concept-name to Meta (SE, DK, NO)"
5. On push failure: Telegram "Failed to push #N concept-name: error-message" — concept stays queued for retry next day

## API Endpoints

### `POST /api/pipeline/queue`
Body: `{ imageJobId: string }`
Marks a concept as queued. Creates `concept_lifecycle` record with `stage = 'queued'`.
Returns: `{ position: number }` (queue position)

### `DELETE /api/pipeline/queue`
Body: `{ imageJobId: string }`
Removes a concept from the queue (cancels it back to draft).
Deletes the `concept_lifecycle` record where `stage = 'queued'` and `exited_at IS NULL`.

### `GET /api/cron/pipeline-push`
Vercel Cron handler. Auth: `Bearer CRON_SECRET`.
Checks queue, pushes concepts when slots available, sends Telegram notifications.

## UI Changes

### Pipeline page
1. Replace "Draft" column with "Queued" column
2. "Add to Queue" button in header → opens modal with available draft concepts
3. Queued cards show position (#1, #2, etc.)
4. Testing slots indicator in summary bar ("3/5 testing slots used")
5. Remove "Import Legacy" button (one-time use, done)

### Queue picker modal
- Shows all completed image_jobs that are not yet queued or pushed
- Thumbnails, name, product badge
- Checkbox multi-select → "Add N to Queue" button
- Sorted by concept_number

## Telegram Notifications

Reuse existing `src/lib/telegram.ts` (`sendTelegramMessage`). New wrapper:

```typescript
// src/lib/telegram-notify.ts
export async function notifyPushSuccess(concept: { number: number; name: string; countries: string[] })
export async function notifyPushFailure(concept: { number: number; name: string }, error: string)
```

## Files to Create/Modify

### New files
- `src/app/api/pipeline/queue/route.ts` — POST/DELETE queue management
- `src/app/api/cron/pipeline-push/route.ts` — Cron auto-push handler
- `src/lib/meta-push.ts` — Extracted push-to-meta logic (shared by API route + cron)
- `src/lib/telegram-notify.ts` — Push notification helpers

### Modified files
- `src/types/index.ts` — Add "queued" to PipelineStage, update PipelineSummary
- `src/lib/pipeline.ts` — Handle "queued" stage in detection + data fetching
- `src/app/pipeline/PipelineClient.tsx` — Replace draft with queued, add queue picker
- `src/app/api/image-jobs/[id]/push-to-meta/route.ts` — Import from meta-push.ts
- `vercel.json` — Add cron schedule for pipeline-push

### Database
- `ALTER TABLE pipeline_settings ADD COLUMN testing_slots integer DEFAULT 5`
