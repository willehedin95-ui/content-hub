---
name: journal
description: Read the latest session journal to pick up where the last session left off. Use at the start of a new session.
user-invocable: false
---

# Session Continuity

When starting a new session or after context compaction, load the latest session journal to understand what was done and what's next.

## Load Previous Context

1. Read `.claude/journal/LATEST.md` if it exists
2. Read `.claude/tasks/backlog.md` if it exists
3. Read recent git log (last 10 commits) for additional context

## Present to User

Summarize briefly:
- **Last session:** What was done
- **Current state:** What's working, what's broken
- **Next up:** Priority tasks from the backlog
- **Blockers:** Anything unresolved from last time

Keep it to 5-10 lines max. The user doesn't want a wall of text — they want to know where they left off.

## When to Load

This skill auto-triggers when:
- The conversation starts and Claude detects a journal exists
- After context compaction when prior work may be lost
- When the user asks "what were we working on?" or "where did we leave off?"
