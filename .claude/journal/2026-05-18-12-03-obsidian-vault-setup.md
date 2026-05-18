# Session: 2026-05-18 12:03 (Obsidian vault + second brain setup)

This session ran across multiple connections over several days. Focus: get Obsidian + Karpathy LLM Wiki pattern + Hermes Agent foundation in place.

## What was done

### Obsidian + vault foundation
- Installed Obsidian v1.12.7 (`/Applications/Obsidian.app`) via DMG curl/hdiutil (no Homebrew on this machine)
- Created vault at `~/Obsidian/Vault/` with Karpathy LLM Wiki structure: `raw/wiki/outputs/`
- Added `ideas/` (own thinking), `memory/` (auto-loaded Claude Code memory, symlinked back to `~/.claude/projects/.../memory/`)
- Restructured `raw/` with per-source-type subfolders: `x/`, `articles/`, `videos/`, `podcasts/`, `books/`, `meetings/`, `notes/`, `assets/`
- Created `wiki/{topics,entities,concepts}/` and `outputs/{briefs,reports}/`
- Created `CLAUDE.md` (vault schema + 7 documented commands), `index.md` (catalog), `log.md` (chronological event log) per Karpathy convention

### Migration
- Migrated `~/.claude/projects/-Users-williamhedin-Claude-Code/memory/` (91 files, 664 KB) into vault
- Renamed original to `memory.bak.2026-05-13/` (safety rollback)
- Created symlink so Claude Code's auto-memory continues to work transparently

### Git sync infrastructure
- Created private GitHub repos:
  - `willehedin95-ui/obsidian-vault` (personal vault)
  - `willehedin95-ui/renew-vault` (SharedVault with Rasmus)
- Installed Obsidian Git plugin (Vinzent03 v2.38.2) in both vaults
- Configured auto-sync: commit + push + pull every 5 min, pull-on-boot
- Vault files now versioned + backed up via GitHub

### Raw content ingested (from session 1)
- 9 X-posts about Karpathy LLM Wiki / Obsidian second-brain → `raw/x/2026-05-13-x-posts-second-brain.md`
- 5 X-posts about Hermes Agent → `raw/x/2026-05-13-x-posts-hermes-agent.md`
- 3 video transcripts about Hermes setup → `raw/videos/2026-05-13-video-transcripts-hermes.md`
- Wrote `wiki/synthesis-patterns.md` extracting design patterns + alternative folder structures + 10 William-specific decisions

### Slash commands (real Claude Code skills)
- Created `/save` skill at `~/.claude/commands/save.md` - ingest external sources to vault raw/, auto-update wiki/memory if topic exists
- Created `/idea` skill - capture brain dump to ideas/, engage with summary + pushbacks + connections (no file-and-forget)
- Created `/brief` skill - weekly synthesis (cyrilXBT pattern: 3 connections, 1 pattern, 1 question, contradictions)
- Versioned via symlink: `~/.claude/commands/` → `~/Obsidian/Vault/commands/` so future skills auto-backup via vault git
- `/wiki`, `/query`, `/lint`, `/memory` documented as conventions in CLAUDE.md but not yet promoted to skill files

### SharedVault for Rasmus
- Set up `~/Obsidian/SharedVault/` as separate vault, shared via private GitHub repo
- Copied 12 Renew + Hydro13 files from personal vault/memory/ to SharedVault/renew/
- Replaced files in personal vault with symlinks to SharedVault (single source of truth, no duplication, no drift)
- Created CLAUDE.md, README.md, index.md, log.md for SharedVault
- Registered SharedVault in Obsidian's vault config (`~/Library/Application Support/obsidian/obsidian.json`) so it shows in vault picker

### Brand routing (added in later session, not by me)
- Hard rule added to vault CLAUDE.md: **Renew/Hydro13 + HappySleep brand content -> SharedVault, not personal Vault**
- HappySleep added as second shared brand (`SharedVault/happysleep/`)
- `happysleep-financials.md` moved from personal Vault memory to SharedVault with symlink back
- `/save` skill updated with brand-routing logic at step 2 (determine target vault BEFORE source type)
- Detailed rule: `memory/feedback_brand_content_to_sharedvault.md`

## Decisions made

- **Use existing memory/-system as wiki layer instead of duplicating into wiki/.** William's 50+ topic files in memory/ already function as Karpathy-style topic pages. `wiki/topics/` is reserved for NEW topics that don't belong in Claude Code's auto-memory. `/wiki` command searches memory/ first, only creates in wiki/ if no existing topic file.
- **Source-type subfolders in raw/, not topic-subfolders.** Topic split is wiki/-layer's job. Raw stays mixed by date.
- **Single source of truth via symlinks** (memory/ -> .claude/projects/, brand files -> SharedVault). Avoids drift, transparent to Claude Code auto-loading.
- **Hermes Agent deferred.** William evaluated cost ($10-15/mo VPS + tokens) vs use case. Initially parked; "brain dumps on walks" identified as killer use case but going Alt A (Wispr Flow + Apple Notes + manual paste) until Hermes friction justifies investment.
- **Brand content -> SharedVault is a hard rule.** Even Williams personal /save commands route Renew/Hydro13/HappySleep material there. Doginwork, huskop, EPS, cykel-pvp stay in personal Vault.

## Current state

### Working
- Obsidian opens both vaults (Vault + SharedVault)
- Obsidian Git plugin auto-syncs every 5 min in both
- Symlinks intact: `.claude/projects/.../memory/` -> personal Vault -> SharedVault for brand files
- /save, /idea, /brief work as real Claude Code skills
- 91 memory files versioned for first time
- Brand routing rule in CLAUDE.md + save.md
- SharedVault content (Renew + HappySleep) ready to share when Rasmus invited

### Not yet done
- Rasmus not yet invited to renew-vault repo (waiting on his GitHub username)
- Hermes Agent setup still parked (use case identified, decision pending)
- MEMORY.md cleanup audit pending (in backlog, research X best practices first)
- `/wiki`, `/query`, `/lint`, `/memory` still documented conventions, not real skills

### Risks / open
- `memory.bak.2026-05-13/` at `~/.claude/projects/-Users-williamhedin-Claude-Code/` should be deleted in ~2 weeks if no rollback needed
- Brand routing for past content NOT migrated retroactively - only new `/save` invocations follow rule

## Blockers / Open questions

- William hasnt yet explained the system to Rasmus (he asked how but pivoted to other questions)
- No clarity on whether brand-routing rule applies retroactively (12 Renew files moved, HappySleep moved, but quiz-funnels/ articles which are Hydro13-relevant stayed in personal Vault memory/)
- /save command updated with detailed YouTube transcript + image-reading flow but never tested end-to-end with a real X-post in this session

## Next up

1. **Test /save end-to-end** with a real X-post or article. Verify image reading + extraction works.
2. **Explain system to Rasmus.** William wanted help with the explanation - draft a short pitch covering:
   - What Obsidian is (markdown notes app, vault = folder)
   - What SharedVault solves (shared brand knowledge via git, both edit, both sync)
   - How Claude integrates (reads vault for context, /save captures, /brief synthesizes)
   - What Rasmus needs to do (Obsidian install, clone repo, enable Obsidian Git)
3. **Invite Rasmus when he provides GitHub username** - `gh api -X PUT /repos/willehedin95-ui/renew-vault/collaborators/<username>`
4. **Hermes Agent decision** - either commit (Hostinger VPS + Codex OAuth via ChatGPT Business) or stay parked. Brain-dumps-on-walks is real driver.
5. **MEMORY.md cleanup audit** - research current best practices on X first (added to backlog), then audit all CLAUDE.md / MEMORY.md across projects (content-hub, doginwork, huskop, cykel-pvp, eps-ventiler).
6. **Delete `memory.bak.2026-05-13/`** after 2 weeks if no rollback needed (~ 2026-05-27).
