---
name: evolve
description: Analyze recent sessions for patterns and auto-create or update skills, rules, and memory. Self-improvement loop.
disable-model-invocation: true
---

# Evolve — Self-Improvement Loop

Analyze recent session journals and conversation patterns to identify opportunities for new skills, updated rules, or improved memory.

## Step 1: Gather Context

1. Read all journal entries from `.claude/journal/` (last 5 sessions max)
2. Read current CLAUDE.md
3. Read all existing skills from `.claude/skills/`
4. Read auto memory files from the memory directory

## Step 2: Pattern Detection

Look for these signals across sessions:

**Repeated corrections** — The user corrected Claude multiple times for the same thing
→ This should become a rule in CLAUDE.md or a negative constraint

**Repeated manual steps** — The user asked for the same sequence of actions more than twice
→ This should become a skill

**Knowledge gaps** — Claude had to re-learn the same facts across sessions
→ This should be in CLAUDE.md or auto memory

**Workflow friction** — Steps that took multiple attempts or required user intervention
→ This should be simplified in an existing skill or become a new one

## Step 3: Propose & Apply

For each finding:

1. **State the pattern** — What happened and how often
2. **Propose the fix** — New skill, updated CLAUDE.md rule, new memory entry
3. **Apply it** — Make the change immediately

**When creating a new skill:**
- Use the standard SKILL.md format with frontmatter
- Include WHY the skill exists (reference the pattern that triggered it)
- Add negative constraints ("NEVER do X") not just positive instructions
- Test that it doesn't conflict with existing skills

**When updating CLAUDE.md:**
- Add to the appropriate section
- Prefer negative rules ("Never X") over positive ones ("Always Y")
- Keep rules specific and actionable

## Step 4: Report

Present a summary of changes made:

```
Patterns found: X
Skills created: Y
Skills updated: Z
Rules added: N
Memory updated: M

Details:
1. [NEW SKILL] /skill-name — Created because [pattern]
2. [CLAUDE.md] Added rule: "Never X" — Because [pattern]
3. [MEMORY] Updated Y — Because [pattern]
```

## Rules

- NEVER create skills that duplicate existing functionality
- NEVER create overly broad skills — prefer specific, focused skills
- NEVER add rules that contradict existing CLAUDE.md instructions
- When in doubt about whether to create a skill vs add a rule, prefer the rule (simpler)
- Skills should only be created for patterns seen 3+ times across sessions
- Single-occurrence patterns go to memory, not skills
