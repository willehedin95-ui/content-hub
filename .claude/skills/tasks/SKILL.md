---
name: tasks
description: View and manage the persistent task backlog that survives across sessions
disable-model-invocation: true
argument-hint: [add|done|list|prioritize] [task description]
---

# Persistent Task Backlog

Manage the task backlog stored at `.claude/tasks/backlog.md`. This file persists across sessions and context compactions.

## Commands

**`/tasks`** or **`/tasks list`** — Show current backlog sorted by priority

**`/tasks add <description>`** — Add a new task. Claude assigns priority (P1-P3) based on:
- P1: Blocking other work, user explicitly asked for it, or impacts revenue
- P2: Important but not blocking, quality-of-life improvements
- P3: Nice-to-have, backlog ideas, future exploration

**`/tasks done <number or description>`** — Mark a task as completed

**`/tasks prioritize`** — Re-sort and clean up the backlog

## File Format

The backlog file uses this format:

```markdown
# Content Hub — Task Backlog
Updated: YYYY-MM-DD

## P1 — Do Next
- [ ] Task description (added YYYY-MM-DD)
- [ ] Another task (added YYYY-MM-DD)

## P2 — Important
- [ ] Task description (added YYYY-MM-DD)

## P3 — Backlog
- [ ] Task description (added YYYY-MM-DD)

## Done (recent)
- [x] Completed task (done YYYY-MM-DD)
```

## Rules

- NEVER delete tasks without marking them done first
- NEVER reorder P1 tasks without user confirmation
- Keep the "Done" section to the last 10 items max (archive older ones)
- When adding a task, check for duplicates first
- If the backlog doesn't exist, create it with the template above
