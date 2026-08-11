# Session: 2026-05-18 - Copycoders bulk ingest (196 transcripts) + 5 wikis + wiki-retrieval best-practice research

Session sträckte sig över flera kalenderdagar 2026-05-15 till 2026-05-18 i samma context. Vault-only arbete - inga content-hub-ändringar.

## What was done

**Pipeline 1: Copycoders transcript bulk-ingest (196 totala transcripts, ~15MB)**
- Pass 1: Drive-uppladdade WEBVTT-transcripts via curl till `drive.google.com/uc?export=download` (publika filer). 100 transcripts från Copy Blocks Training, VIP Workshop (alla 8 kurser), Premium Trainings (delvis auth-locked), CA Vault (Getting Clients + Breakthrough Ideas)
- Pass 2: AICSA + GEN AI + recent live calls (~30 transcripts via Drive)
- Pass 3: Chrome extension YouTube-pipeline för videos UTAN uppladdat Drive transcript - this was a major correction after William flaggade "fan då har du missat skitmycket". Pipeline från `memory/youtube-transcript-bulk-workflow.md` funkade pålitligt: navigate til youtube.com/watch?v=ID → run JS som klickar ytt-main extension panel Transcript-tab → poll → download som txt → batch-integrate
- Pass 4: Pushed completion - fyllde i resterande 53 transcripts från Automations Calls (alla 15), AI Implementation Calls (alla 15), 5-phases-calls, ascension-calls, special-calls, freelancer-revelations, copy-sales-letter-funnel-breakdown, open-q-a-s-calls, fb-compliance-calls

**Pipeline 2: 5 parallella wiki-syntheses (5486 rader)**
- Dispatchade 5 general-purpose subagents parallellt, varje fick sin lista transcripts att läsa + struktur att följa
- copy-blocks-framework.md (848 lines) - Mario+Luke P3C2 ramverk, 14 transcripts
- rmbc-method.md (807 lines) - Stefan Georgi RMBC, 11 transcripts
- copycoders-claude-code-automations.md (1206 lines, 76KB) - 28 transcripts, 16 prompts extraherade verbatim, identifierade att William är vid Phase 6-7 av Nuno's progression (top 1%)
- ai-creative-strategist-mastery.md (1416 lines) - AICSA 23 transcripts, 60-term glossary
- copycoders-ai-bots-iro-sherlock.md (1209 lines) - IRO + Sherlock + AI Bot Building 11 transcripts, 4-week build order för William

**Pipeline 3: Wiki-retrieval best-practice research**
- Williams fråga: "best practice för att triggera wiki-läsning från en email/copy-uppgift?"
- Läste existing vault material (synthesis-patterns.md - Karpathy LLM Wiki, Hermes patterns)
- Browsade Williams X-bookmarks i Chrome → identifierade 7 nya posts (maj 11-17 2026)
- Fetchade via fxtwitter API, sparade som consolidated raw file (68KB):
  - Nav Toor "How to Build a Personal AI System With Claude" - 80K views, 7-layer architecture
  - Suryansh Tiwari (×2) "Your Obsidian Vault is Probably Dead" - storage vs intelligence
  - Nainsi Dwivedi "RAG Doesn't Learn - Karpathy's LLM Wiki" - 62K views, paradigm shift
  - Akshay "Claude Code /goal" + CyrilXBT "/goal SEO Content System"
  - Shann "How to Become a Hermes Agent Operator"
- Delivered evidence-based 4-prio recommendation, NO implementation (per memory feedback_discuss_before_coding_big_changes)

## Decisions made

**Saving format för Copycoders YT-transcripts**: använde Chrome extension pipeline från memory-fil istället för yt-dlp/youtube-transcript-api (IP-blocked + "TranscriptsDisabled" errors). Pipeline funkar för alla 2019+ Copy Coders uploads.

**Wiki-synthesis via parallella subagents**: 5 agenter parallellt > 1 agent serialt. Bevarar context-budget för main session. Vardera fick ~250K-550K tokens own context.

**Symlinks som retrieval-mekanism (recommendation, not implemented)**: existing memory/ folder är auto-discovered av Claude Code. Symlinks från wiki/topics/*.md in i memory/ vore minst friction. Plus pointers i MEMORY.md med READ-triggers.

## Current state

**Vault**:
- 196 Copycoders transcripts i `raw/videos/2026-05-15-copycoders-*.md`
- 1 nytt X-poster-batch: `raw/x/2026-05-16-x-posts-personal-ai-system-wiki-retrieval.md`
- 5 nya wikis i `wiki/topics/` (cross-länkade med citation-style `[[raw/videos/...|filename]]`)
- index.md + log.md uppdaterade
- Auto-syncar via Obsidian Git plugin (verified: working tree clean)

**Memory-systemet**: oförändrat denna session (rekommendationer ej implementerade)

**content-hub**: ingen kod-ändring denna session. Pre-existing untracked files (gamla journals + node_modules) ej rörda.

## Blockers / Open questions

- **Wiki retrieval implementation pending**: William fick rekommendation (prio 1-4) men sa inte "go". Kräver hans samples för voice-guide-filer (Prio 2).
- **AI Listicle Factory transcript saknas**: AICSA-wiki-subagenten flaggade att en av 8 specialty masterclasses (`aicsa-main-course-ai-listicle-factory.md`) inte finns i vault. Var auth-locked Drive tidigare. Skulle krävat YT-extension-extraction men hoppade över.
- **Auth-locked Premium Training drives**: ai-copy-chief-training, inbox-automator, core-4-money-magnets returnerade 404 HTML från Google Drive (privata Drive-mappar). Inte hämtbara via curl-pipeline.
- **Mindset Scott Mills calls**: bekräftat utan captions enabled på YouTube → extension-pipeline timeoutar. Inte hämtbara.

## Next up (prioriterad)

1. **Wiki retrieval implementation (HIGH, blocked på Williams beslut)** - när William säger "go": symlink wikis in i memory/, lägg pointers i MEMORY.md, eventuellt skill-baserade `/email /ad /vsl /landing` slash-commands.
2. **Voice-guide files per brand (HIGH, blocked på Williams samples)** - voice-guide-renew.md, voice-guide-happysleep.md, voice-guide-marie.md. Detta är Nav Toor Layer 4 - största gapet i Williams setup.
3. **Wiki-retrieval-best-practice memory file** (LOW) - destillera dagens 7 X-posts + synthesis-patterns.md till en operativ memory-fil att alltid läsa vid copy-arbete.
4. **Resolve action items från Copycoders-wikis** - flera enskilda follow-ups som subagents flaggade (se separate items i backlog).
