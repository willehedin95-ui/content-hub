# Session: 2026-06-08 20:49 - Renew namnbyte (naming/rebrand)

OBS: Inte content-hub-dev. Hela sessionen var varumärkes-/namnarbete för Renew. Artefakter i SharedVault/renew + Notion + Claude Code/scripts/.

## What was done
- Transkriberade Petra/Bergenstrahle-samtalet (varumarkesjurist, whisper). Besked: "Renew" gar INTE att registrera (beskrivande + redan upptaget i klass 3/5). Rekommenderar nytt namn + EU-ansokan (EUIPO). Sparat i SharedVault.
- Djup namn-exploration for Renew-ersattaren. Hundratals namn over manga genrer.
- Byggde 3 ateranvandbara scripts i `Claude Code/scripts/`: `domcheck.sh` (.com via RDAP, .se via IIS), `tmcheck.sh` (varumarkes-knockout EUIPO+PRV via TMview, klass 3/5), `com-free.sh` (parallell .com-koll via Verisign).
- Dokumenterade strategi + namn-brief i Notion (Brand names-sidan: "Brief till Rasmus", "Naming-arbete sammanfattning") + SharedVault (`renew-namnbyte-clearance-2026-06-05.md`, `renew-namnstrategi-brief-rasmus-2026-06-05.md`, `renew-varumarke-bergenstrahle-2026-06-05.md`).
- Synteserade 12 brand-naming-videor -> `Vault/wiki/topics/brand-naming-playbook.md`.

## Decisions made
- Arkitektur: paraply/branded house, EN filosofi ("skonhet/styrka byggs inifran"), tomt-karl-namn, konsneutralt namn + feminin beachhead, brand + beskrivande produkt (slang Hydro13 som produktnamn -> "[Brand] Ultimate Collagen").
- Positionerings-insikt (William, stark): emotionell karna = "kann dig som dig sjalv igen / fa tillbaka ditt riktiga jag" (skalar till muskler/leder). Battre an mekanismen "inifran".
- Sikta Suggestive/Arbitrary (Hart-spektrat). Doman sekundart (get-/.se).

## Current state - VAR NAMNET LANDADE
- Williams faktiska smak = KORTA ENGELSKA EMOTIONELLA FRASER. Han tande pa:
  - **Inside Job** ("fet"; TM ser fri ut i klass 3/5 - bara Netflix i klass 41 + ett utganget marke)
  - **Second Wind** ("coolt"; ledig pa EUIPO; secondwind.com+.se tagna -> get-/.co, men han ogillar .co)
  - **Me Again**, **Recall** (Recall = hans eget ord fran Notion-listan, perfekt for "yourself again"-vinkeln)
- AVVISAT hart: alla svenska ord (varje register - normalt/compound/wellness/ruggat/pretty: "IKEA-produkter", "herr-tval", "girly", "tontigt"), abstrakta myntade ord (Freyona), beskrivande, djurnamn (trott pa dem).

## Blockers / Open questions
- TMview rate-limitade min IP efter hog volym -> kunde inte TM-verifiera finalisterna. Behover svalna (eller anvand EUIPO eSearch / Petra).
- Namnet INTE valt. William pausade, fortsatter i ny chatt.

## Next up (prioritet)
1. **Ga tillbaka till den vinnande lanen: engelska emotionella fraser** ("me again"/comeback/aterga-till-sig-sjalv). Starta INTE om svenska ord.
2. TM + doman-koll pa finalisterna nar TMview slapper: Inside Job, Second Wind, Me Again, Recall (+ Second Act, Encore, Return to Form, Homecoming fran samma ader).
3. Skicka shortlist till Petra for ID-kontroll (mejlutkast finns i chatten/Notion). Bekrafta med henne: ryms flera namn i 10k-ID-kontrollen eller per namn?

## Lessons (self-improvement)
- Foreslog upprepat OKOLLADE namn som var uppenbart tagna (Comet) eller konkurrenter (Moby = drinkmoby.com han visat mig). REGEL: doman/TM-kolla FORE forslag, eller flagga tydligt som okollat.
- Overkurerade varje batch for en vibe (edgy/wellness/girly) -> blev nedskjuten gang pa gang. REGEL: nar anvandaren vill ha "normalt", ge neutralt/platt, designa inte for en vibe.
- Kanna igen nedskjutnings-loopen tidigare (memory: break-fix-retry-regeln) - fortsatte generera istallet for att stega tillbaka till det som tande.
