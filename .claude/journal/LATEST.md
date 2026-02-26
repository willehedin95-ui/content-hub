# Session: 2025-02-25

## What was done
- Implemented style picker for static ad generation (8 clickable style chips, awareness-based pre-selection)
- Added prompt visibility (ExpandablePrompt component, generation_prompt/generation_style DB columns)
- Fixed "Importing from Drive" text for brainstorm-generated concepts
- Added future ideas to plan.md backlog (preview thumbnails, concept diversity, image diversity)
- Created 10 Claude Code skills: /context, /migrate, /dev, /deploy, /status, /annotate, /wrap-up, /evolve, /journal, /tasks
- Added negative rules section to CLAUDE.md
- Created persistent task backlog at .claude/tasks/backlog.md

## Decisions made
- Style chips use amber for native styles, indigo for regular styles (visual distinction)
- generation_prompt and generation_style stored on source_images table (not a separate table)
- Only 1:1 ratio used for Meta ads (9:16 code exists but unused)
- Skills stored at project level (.claude/skills/) not personal level (~/.claude/skills/)

## Current state
- Style picker and prompt visibility are implemented and build passes
- Dev server was running on :3000 (may need restart)
- All 10 skills created and ready to use
- Backlog created with priorities

## Next up
1. Test the style picker + prompt visibility end-to-end
2. Consider installing superpowers plugin for systematic debugging + planning
3. Preview thumbnails on style chips (P2)
4. Concept diversity / dislike feature (P2)
