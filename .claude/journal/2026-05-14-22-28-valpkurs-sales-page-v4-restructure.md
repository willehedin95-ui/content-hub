# Session: 2026-05-14 22:28 - Valpkurs sales page v3 → v4 full restructure

## What was done

### Course content extraction (foundation work)
- Whisper API-transkriberade alla 11 MP3-moduler från Valpakademin → `doginwork/docs/course-content/transcripts/` (~125KB)
- Navigerade Tevello via Claude in Chrome, extraherade alla 17 sektioner + ~55 lektioner
- Dokumenterade kursstruktur i `doginwork/docs/course-content/00-structure.md`
- Skapade `doginwork/scripts/transcribe_valpakademin.sh` för framtida re-runs

### Spec v3 written, approved, deployed
- Spec på `doginwork/docs/superpowers/specs/2026-05-14-valpkurs-sales-page-rewrite-v3.md`
- William godkände A-G på alla 7 öppna beslut
- Klaviyo subscriber-unlock-mekaniken specificerades (Grüns-style)

### v3 → v4 sales page rebuild (iterativt med William-feedback)
- Hela `sales_page_html_body.py` rewriten flera gånger baserat på Williams visuella feedback
- Final struktur (15 sektioner) mappar SpiritDog Ultimate Puppy Program:
  1. Hero (preventive-frame med 10 min/dag promise + 3 checkmarks)
  2. Pain - 5 problems som tar över valptiden (rosa cards + gul callout-box)
  3. Roadmap - 11 moduler med "Vad du lär dig"-bullets + FAVORIT-badges + hero-bild
  4. Future pacing - 4 timeline-cards (Dag 3-21)
  5. Offer box - 4 bonusar + value stack (9 176 kr → 997 kr)
  6. Garanti - 30 dagars öppet köp
  7. Price comparison - Privattränare/Vanlig kurs/Valpakademin
  8. Qualifier - 9 bullets SpiritDog-mirror med emojis
  9. Marie introduction - advertorial-style story + marie-credentials.webp
  10. Före/efter polaroid social proof
  11. 87% statistik med avatars
  12. FAQ
  13. Urgency - 3-row timeline (8-16v, 4-7m, 7+m warn)
  14. Final CTA - recap-lista + 997-pris
  15. Sticky bar

### Två live URLs
- `pages.doginwork.se/valpkurs/` - public, 1 499 kr default (VALP500-rabatt)
- `pages.doginwork.se/valpkurs-erbjudande/` - subscriber-secret, 997 kr (VALP2026)

### Shopify discount-code skapad via API
- VALP500 (-500 kr fixed, all items, all customers, ingen utgångstid)
- ID: `gid://shopify/DiscountCodeNode/1878177218903`
- Verifierat funkar i cart-permalink

### 5 Higgsfield-bilder genererade
- Hero before/after (sparades tidigare session som sales-hero-beforeafter.webp)
- Roadmap (2 golden retrievers i höstskog) - sales-roadmap.webp
- Future pacing (4 valpar på matta) - sales-future.webp
- Urgency (närbild labrador-valp) - sales-urgency.webp
- Final CTA (golden retriever i vardagsrum) - sales-finalcta.webp
- Qualifier (kvinna med border collie-valp) - sales-qualifier.webp
- Alla uppladdade till Supabase `translated-images/quiz-assets/doginwork-valpakademin/`

### Copy-iterationer (många)
- Hero gick igenom 8+ versioner innan William godkände SpiritDog-mirror-format
- Pain cards 1:1 SpiritDog (Vassa tänder → Sylvassa tänder, etc.)
- Qualifier 9 bullets med emojis (Du är förstagångs-valpägare överväldigad, etc.)
- Marie: "Möt Marie" → "Möt din instruktör", "tusentals" → "hundratals"
- Före/efter: object-fit:contain + #BDBDBD grå bg (matchar polaroid-frames)
- "Subscriber-pris" → "Medlemspris" (svenska)

### Felaktigheter rättade
- "14 års hundpsykologi" felaktigt (det är 14 år i hundbranschen, inte alla som psykolog)
- 234 → 230+ (ungefärlig social proof)
- McConnell-quote borttagen från Marie intro (passar inte i hennes presentation)
- Klarna-pushande nedtonat i FAQ + pricing-card

## Decisions made

### Two-tier pricing arkitektur
- Public sales page (`/valpkurs`): 1 499 kr med VALP500
- Subscriber secret page (`/valpkurs-erbjudande`): 997 kr med VALP2026
- Klaviyo flow mailar subscriber-URL till email-prenumeranter
- Båda kompletterar advertorial (997 kr) + quiz (997 kr) som existing köpvägar
- Same-page state-flip via localStorage funkar fortfarande på public sidan om Klaviyo popup används

### Copy-source-of-truth-prioritering
- **Avatar-quotes från `doginwork/docs/01-avatar.md`** = primary source för Christines språk
- **SpiritDog ultimate-puppy-program** = strukturell mall för sektioner
- **Copy Blocks framework** (P3C2 + CVS) från `copywriting/knowledge-base/copy-blocks-deep.md` = ramverk
- **Marie-transcripts** = NOT sales-copy-källa (instruktör-röst för retention, inte acquisition)

### 4-stegs-metoden skippad
- William: antingen förklara den i egen sektion eller skip helt
- Beslut: skip från sales page (för långt att förklara, SpiritDog har ingen mekanism heller)
- "4-stegs-metoden" borttaget från hero sub

## Current state

### Live & klart
- 2 sales page URLs deployade på CF Pages (`pages.doginwork.se/valpkurs/` + `/valpkurs-erbjudande/`)
- VALP500 + VALP2026 i Shopify (båda ACTIVE)
- 6 Higgsfield-bilder uppladdade till Supabase
- Spec v3 + handover-doc finns

### Working
- Hero outcome-led + concrete pain-list + 10-min-promise
- Pain section 1:1 SpiritDog
- Roadmap med FAVORIT-badges på 3 moduler (4 Grundstenar, Socialisering, Passivitet)
- Future pacing 4 cards
- Offer box med 4 bonusar + value-stack
- Price comparison + garanti
- Qualifier 9 SpiritDog-mirror bullets
- Marie intro med credentials-bild + advertorial-style story
- Före/efter polaroids (grå bg matchar)
- 87% stat block
- Urgency 3-tier timeline (varning-rad på 7+m)
- Final CTA recap-lista

### Not done / pending
- Klaviyo popup-form + nurture-flow inte uppsatt (William sätter upp i Klaviyo dashboard)
- Klaviyo company-ID är fortfarande placeholder i koden (`REPLACE_WITH_KLAVIYO_PUBLIC_KEY`)
- Trustpilot-recensioner = placeholder copy i före/efter-cards (vi planerade extrahera riktiga senare)
- LCP-optimering av hero-image på public-sidan inte gjord (kan vara prio nästa session)
- PR #1 (`feat/valpkurs-sales-page` branch i content-hub) inte merged

## Blockers / Open questions

- Klaviyo company-ID behövs för att popup-mechanism ska funka
- Riktiga Trustpilot-recensioner behöver extraheras (vs placeholder)

## Next up (prioritetsordning)

1. **Klaviyo-setup** - skapa popup-form (scroll 50% + exit-intent), nurture-flow med subscriber-URL, sätt company-ID i Python-builder
2. **Trustpilot-recensioner** - extrahera 3 riktiga från trustpilot.com/review/doginwork.se, ersätt placeholder-copy i före/efter-section
3. **LCP-optimering** - resize hero-image till mindre format för mobile (sparar ~50% bytes)
4. **PR #1 merge** - när sidorna stabiliserats
5. **Content-hub commit** för doginwork-relaterade ändringar i worktree (om något ändrats - inget gjorde denna session)
6. **Listicle-trafik byggning** - nästa steg i funnel-arkitekturen per spec
