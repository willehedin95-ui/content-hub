---
name: wrap-up
description: End-of-session routine — commit code, journal what happened, review for self-improvement, update memory and rules
disable-model-invocation: true
---

# Session Wrap-Up

Run these phases in order. Auto-apply all changes without asking. Present a consolidated report at the end.

## Phase 1: Ship It

1. Run `git status` in the content-hub directory
2. If uncommitted changes exist:
   - Stage relevant files (never `.env` or credentials)
   - Auto-commit with a descriptive message
   - Do NOT push unless explicitly told to — the project auto-deploys to Vercel on push
3. Run `npm run build` to verify nothing is broken
4. If build fails, note it as a blocker for the journal

## Phase 2: Journal It

Write a session journal entry to `.claude/journal/YYYY-MM-DD-HH-MM.md` (create the directory if needed).

Format:
```markdown
# Session: [date and time]

## What was done
- [Bullet list of completed work]

## Decisions made
- [Any architectural or design decisions, with reasoning]

## Current state
- [What's working, what's broken, what's in progress]

## Blockers / Open questions
- [Anything unresolved]

## Next up
- [What should the next session work on, in priority order]
```

Also update the "latest" symlink/file at `.claude/journal/LATEST.md` with a copy of the most recent entry. This is what gets loaded at the start of the next session.

## Phase 3: Remember It

Review the session for knowledge that should persist:

| Where to put it | When |
|-----------------|------|
| **Auto memory** (`~/.claude/projects/.../memory/`) | Debugging insights, project quirks, patterns discovered |
| **CLAUDE.md** (project root) | Permanent conventions, architecture decisions |
| **MEMORY.md** (auto memory) | Cross-project patterns, user preferences |

Decision framework:
- Is it a permanent project convention? → CLAUDE.md
- Is it a pattern Claude discovered? → Auto memory
- Is it a user preference? → MEMORY.md
- Is it session-specific context? → Journal only (Phase 2)

## Phase 4: Review & Apply (Self-Improvement)

Analyze the conversation for improvement opportunities. If the session was short or routine, say "Nothing to improve" and skip.

**Categories:**
- **Skill gap** — Things Claude struggled with or got wrong
- **Friction** — Repeated manual steps that should have been automatic
- **Knowledge** — Facts about the project Claude didn't know but should have
- **Automation** — Repetitive patterns that could become skills

**Actions to take:**
- Update CLAUDE.md with new conventions discovered
- Create or update auto memory files
- Note potential new skills (don't create them — just log the idea in journal)

Present a summary:
```
Applied:
1. [CLAUDE.md] Added X convention
2. [Memory] Saved Y pattern

No action needed:
3. Already documented: Z
```

## Phase 5: Task Handoff

Read `.claude/tasks/backlog.md` if it exists. Update it:
- Mark completed items as done
- Add any new items discovered during the session
- Re-prioritize based on what was learned
- Flag any items that are now blocked

This ensures the next session has a clear starting point.
