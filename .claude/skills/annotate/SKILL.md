---
name: annotate
description: Watch for browser annotations from Agentation and process them — fix UI issues, make changes, respond to feedback
disable-model-invocation: true
---

# Agentation Annotation Watcher

Watch for annotations the user makes in their browser via Agentation and process them.

## Flow

1. **Check for pending annotations** first:
   - Call `agentation_get_all_pending` to see if there are any unprocessed annotations

2. **If no pending annotations, start watching**:
   - Call `agentation_watch_annotations` with a reasonable timeout (120s)
   - This blocks until the user creates annotations in the browser

3. **Process each annotation**:
   - Read the annotation text and context (URL, element, screenshot if available)
   - Acknowledge it with `agentation_acknowledge`
   - Determine what action is needed (code fix, UI change, content update, etc.)
   - Make the change in the codebase
   - Reply to the annotation with what you did using `agentation_reply`
   - Resolve it with `agentation_resolve` and a summary

4. **Loop** — After processing a batch, go back to watching for more annotations

## Rules

- Always acknowledge annotations before starting work on them
- Only resolve annotations after the fix is actually implemented
- If an annotation is unclear, use `agentation_reply` to ask for clarification before making changes
- If the dev server is running, changes should hot-reload automatically
- For UI changes, describe what you changed so the user can verify in the browser
