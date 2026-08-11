# Session: 2026-05-16 + 2026-05-17 - Marketing books canon build

(Spans två dagar - startade 2026-05-16, wrap-up 2026-05-17)

## What was done

**Inte i content-hub denna session - allt i `~/Obsidian/Vault/`.**

### Phase 1: Video transcript bulk-fetch (2026-05-15 -> 2026-05-16)
- Bulk-fetched top 100 YouTube-videos från 3 kanaler: @markbuildsbrands, @anthonyvcamacho, @AlexHormozi via Chrome-extension-pipeline (`memory/youtube-transcript-bulk-workflow.md`). 298/299 OK (1 video saknade captions).
- 30 batchar a 10 videor genom browser_batch MCP-tool. JS-pipelinen krävde justering till resilient poll-baserad (40 retries x 500ms) istället för fixed 4000ms wait - första batchen hade 4/5 NO_YTT-fel innan fixet.
- Ingested transcripts till `raw/videos/2026-05-15-{author}-*.md` per existerande Maxwellcopy-konvention.

### Phase 2: Video-corpus synthesis (3 wikis)
3 parallel synthesis-agents:
- `wiki/topics/markbuildsbrands-playbook.md` (824 rader)
- `wiki/topics/anthonyvcamacho-playbook.md` (878 rader)
- `wiki/topics/hormozi-playbook.md` (758 rader)

### Phase 3: Marketing books canon meta-wiki
- Hittade 2 Mark book-tier-list-videos i corpus, extraherade rankings
- Web research verifierade Retention Economics (Thomas Lalas, sept 2025)
- Skrev `wiki/topics/marketing-books-canon.md` - S/A/B/C/D-tier + reading-order per Williams brands + var-att-fa-tag-i

### Phase 4: Book ingest (19 källor, ~9.15M chars)
- 9 EPUBs via ebooklib + BeautifulSoup (Hormozi-trilogi, Great Leads, Pre-Suasion, Retention Economics, Brunson-duo, How Brands Grow, $100M Offers)
- 5 PDFs via PyMuPDF (Influence original, Cashvertising, Adweek Copywriting, Halbert Method P3, Hormozi Lost Chapter)
- 4 public-domain PDFs från archive.org + navalmanack.com (Hopkins Scientific Advertising, Caples Tested Advertising Methods, Collier Letter Book, Naval Almanack)
- 1 web-scrape: Halbert Newsletter Archive (171 sidor, 2.45M chars) från thegaryhalbertletter.com

Total: 19 filer i `raw/books/2026-05-16-*.md`

### Phase 5: Book-content synthesis (7 wikis, 4840 rader)
7 parallel synthesis-agents:
- `wiki/topics/direct-response-fundamentals.md` (714 rader) - 6 DR-böcker
- `wiki/topics/cialdini-persuasion-deep.md` (627)
- `wiki/topics/hormozi-trilogy-deep.md` (1146)
- `wiki/topics/brunson-funnels-playbook.md` (668)
- `wiki/topics/retention-economics-applied.md` (559)
- `wiki/topics/halbert-archive-wisdom.md` (628)
- `wiki/topics/sharp-how-brands-grow-counter.md` (498)

## Decisions made

- **Synthesis-strategi:** Topic-based wikis (7 st) snarare än per-book (19 st). Cross-references mellan böcker fanger där värdet ligger - vad är gemensamt mellan Hopkins/Schwartz/Halbert/Caples om headlines, etc.
- **Sharp How Brands Grow positionerades som counter-narrative** - explicit för att tvinga William att se båda paradigm istället för att blint köra DR/retention-orthodoxin.
- **Hormozi-trilogi-wiki bygger ovanpå existerande `memory/hormozi-*.md`-filer** (deeper layer, inte duplicate). YouTube-wiki + bok-wiki är parallella.
- **Naval Almanack inkluderades trots att det inte är strikt marketing** - flaggat som mindset-bonus.
- **Halbert-archive scrapad bara fritt-tillgänglig del** - Newletter-archives-protected/ (404s utan email-signup) hoppades. 171 sidor of 200+ fångade.
- **Brunsons books inkluderades trots Mark's "info-business" caveat** - cross-applicable för doginwork quiz-funnel + delvis för Renew funnel-thinking.

## Current state

**Vaulten:**
- 19 böcker raw-ingestade (~9.15M chars)
- 7 nya book-content-syntheser i `wiki/topics/` (4840 rader)
- 1 meta-wiki `marketing-books-canon.md` med tier-list + var-att-fa-tag-i
- index.md uppdaterad
- log.md har 3 nya entries

**Content-hub:** orord under sessionen. Branch är 4 commits framme om origin/main (tidigare arbete), 9 untracked filer (gamla journal-entries fran tidigare sessions + node_modules). Inget att bygga/committa fran denna session.

## Blockers / Open questions

- **Konflikten Lalas vs `memory/renew-offer-strategy`** (2-pack-tier-frågan) - flaggad i `retention-economics-applied.md` men inte resolverad. Värt en separat session när du designar Renew-erbjudandet.
- **`memory/renew-retention.md` follow-ups** - retention-economics-applied-wikin listar 4 specifika updates som vore värda göra.
- **Caples-PDF var OCR-korrupt** - principerna rekonstruerade fran hur Whitman/Sugarman/Masterson citerar honom (flagat i DR-fundamentals-wikin). Om du vill ha "ren" Caples maste du hitta bättre PDF.
- **Halbert Boron Letters kap 5-15, 17-19, 21-25 saknas** - bara kap 1-4, 16, 20 i free archive. Bond Halberts publicerade samling har hela 25.
- **Breakthrough Advertising (Schwartz)** är fortfarande enda gap i canon - hard-find. Brunson Box / Boardroom reprint.

## Next up

Inget akut. När du är redo:
1. **Resolve Lalas vs renew-offer-strategy 2-pack-konflikten** - en session som faktiskt drar slutsats om RCM-Trifecta-modellen ska anammas eller om Williams existerande "two tiers only"-tes håller.
2. **Cart-abandonment Klaviyo-flow** for doginwork (HIGH backlog-item).
3. **Renew email-flows-impl-doc** i SharedVault som applicerar dtc-email-playbook-syntesen.
4. **Diversifiera email-KB med Chase Dimond / Val Geisler / Stefano Apostolakis** (MEDIUM backlog-items).
