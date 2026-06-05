# Session: Frysen grocery automation - från noll till full pipeline

**Datum:** 2026-05-25 (kvällen) -> 2026-05-26 (eftermiddag)
**Scope:** Bygga en "HelloFresh-variant" på Williams Notion-receptbank + Willys/ICA-cart-automation
**Resultat:** 38 commits, 105/105 tester, fungerande end-to-end pipeline + 1 live cart-fill bevisat IRL

## Vad William ville bygga

En app som:
1. Tittar på veckorabatter Willys/ICA
2. Föreslår 7 recept för veckan (William+sambon väljer 4)
3. Bygger konsoliderad inköpslista
4. Fyller kundvagnen automatiskt
5. Skriver inköpshistorik in i förslags-rankningen ("vanliga varor" auto-added)

Sätter sig ovanpå befintlig `frysen`-app (Next.js + Supabase + Notion-sync av matlådor).

## Vad som faktiskt blev byggt

**Phase 1 - Cart MVP (Willys):**
- Reverse-engineerad Willys interna API (`/axfood/rest/cart/addProducts` - batch POST)
- Playwright-script `npm run cart-mvp` med persistent profile, fyller kundvagn från hand-mappad JSON
- Verifierat end-to-end IRL

**Phase 2 V2 - Ingredient → SKU mapping (history-first):**
- 33 Willys-ordrar reverse-engineerade, 1485 items, 560 unika produkter
- Williams 158 habituals (köpta ≥3 ggr) feed:as som LLM-context tillsammans med Notion-ingredient-text
- LLM (Claude Sonnet 4.6) gör canonicalize + history-match i ett anrop
- ~52-83% hit-rate mot Notion-recept
- `npm run resolve-recipe -- <page_id>` + `npm run cart-from-resolved -- <page_id>`

**Phase 3 Chunk 2 - rabatt-pipeline:**
- `discount-fetcher-willys.ts` + `refresh-discounts.ts` CLI
- Field-names i Willys promo-XHR är defensiva placeholders, fungerar på första körning eller logs raw shapes

**Phase 4 - Notion bulk extension:**
- KRITISK insight: Williams Notion har dedicated `ingredienser` (rich_text) property, INTE i body som jag först trodde. Live-rätta via William.
- Notion-parser utökad med ingredienser/portioner/tillagningstid/URL
- Supabase migration (William applies manually)
- `sync-ingredients` CLI bulk-canonicaliserar via LLM (~$1 för 100 recept)

**Phase 5 - Weekly meal plan engine:**
- `recipe-ranker.ts` (pure, TDD)
- `ingredient-consolidator.ts` (pure, TDD)
- `store-chooser.ts` (pure, TDD - 15% split-threshold)
- `weekly-plan` CLI → ranker visar 7+1
- `weekly-build` CLI → konsoliderar, väljer butik
- `cart-from-weekly` CLI → POSTar till Willys

**Phase 6 minimal - UI:**
- `/handla` page i Next.js renderar weekly-plan ranker-output
- Status badges, protein-färger, score, kostnad, "ny för dig"/"i frys"-markeringar

**Polish-pass:**
- `ica-cart.ts` + `ica-session.ts` - formaliserad ICA cart-helper
- `sku-picker.ts` (pure, TDD) - smart picker med per-kg-pris-preferens + kategori-filter (paprika vs paprikapulver)
- sku-resolver-prompt: skippa vatten/salt/peppar/olja/socker/etc

## Live cart-fill bevisat IRL

William handlade på ICA i realtid medan vi byggde. Två recept fylldes:
- Kyckling curry (10 ingredienser, ~280 kr) - via Chrome MCP + ICA API direkt
- Tacopaj med tortilla (6 ingredienser + lök från curry, 8-port-justerat)

Live-bevis att ICA API funkar med batch-POST. CSRF-token måste capturas via UI-click först.

## Lärdomar

**Tekniska:**
- Willys = Next.js + axfoodcommercewebservices (Hybris). Search-API icke-implementerad, DOM-scrape behövs.
- ICA = "lastmile" custom. Search-API fungerar. Cart-API kräver `X-CSRF-TOKEN` som roterar per session.
- ICA produkter har UUIDs. Willys har `<digits>_(ST|KG)` format.
- KG-produkter på Willys: API tar `qty` som "antal pieces", server omvandlar till gram baserat på snittvikt.
- Pack-size optimization icke-trivial - 480g recept vs 1kg paket = overshoot. Phase 5-problem.

**Process:**
- William rättade mig 3 ggr:
  1. Slutade efter 50 min på 8h-natt-plan (memory-rule om time-bounded autonomous work)
  2. Fel premiss om Notion-data (jag tittade body istället för properties)
  3. Failade på date-picker - han fixade manuellt
  
  Alla 3 var rimliga corrections. Min initial-research var slarvig - lärdom: inspektera ALL data inkl properties innan slutsatser.

- Williams insikt att inköpshistorik är SKU-katalogen sparade massa scope vs original Fas 2-design (search-API + interactive CLI).

**Cost:**
- 1 LLM-call per recept ~1 cent
- Engångs ~$1 för 100 recept förstagångs-resolve
- Cache:as via `ingredients_source_hash`
- Search-fallback (för specialingredienser) ej wired in - värdefull next iteration

## Vad återstår

1. **Aktivera bulk-pipelinen:**
   - William apply:ar Supabase-migration (manuellt i dashboard)
   - Kör `npm run sync` (befintlig, nu med nya properties)
   - Kör `npm run sync-ingredients` (~$1 LLM-cost)
   - Öppna localhost:3000/handla → se 100+ recept rankade

2. **Search-fallback wired in:** `pickBestCandidate` existerar med tester men ingen kod använder den ännu. CLI `resolve-missing` skulle automatiskt söka unresolved canonicals via Willys/ICA search-API och spara godkända i catalog.

3. **`cart-from-resolved-ica.ts`:** Speglar `cart-from-resolved.ts` för ICA. Använder ny `ica-cart.ts`-helper.

4. **Fas 6 övriga sidor:** /katalog, /rabatter, /inställningar, /recept-extension.

5. **Pack-size optimization** i konsolidatorn (recipe behöver 480g, pack är 500g → 1 pack inte 2).

6. **Hermes-på-VPS för cart-trigger från UI:** Idag triggas Playwright lokalt via CLI. För /handla att kunna ha "Lägg i kundvagn"-knapp behöver Playwright köras någonstans som inte är Vercel serverless.

## Filer på disk (frysen-projektet)

**Specs:** `docs/superpowers/specs/2026-05-25-willys-cart-mvp-design.md` + `2026-05-26-phase-{2,3,4,5,6}-*-design.md`
**Plans:** `docs/superpowers/plans/2026-05-25-willys-cart-mvp.md` + `2026-05-26-phase-{2,3,4,5}-*.md`

**Data files (gitignored):**
- `scripts/data/purchase-history.json` (560 items, 1 år)
- `scripts/data/recipe-mvp.json` (6 Kyckling curry items)
- `scripts/data/resolved-2d5fdc1d-3334-804d-ad73-f3b467b373d4.json` (Kyckling curry resolved)
- `.playwright-willys/` (persistent Playwright profile)
- `.playwright-ica/` (created but William inte loggat in via Playwright än)
- `.exploration/` (utforskningsdata + manual prototype scripts)

**Scripts:** 20+ filer under `scripts/` - vse mapping ovan
**Tests:** 16 test-filer, 105 tester, alla gröna

## CLI-cheatsheet

```bash
cd "/Users/williamhedin/Claude Code/frysen"

# Test-suite
npm run test

# Setup (en gång / månad)
npm run refresh-history           # Willys + ICA inköpshistorik (kräver manuell login)
npm run refresh-discounts          # veckans rabatter

# Per recept
npm run resolve-recipe -- <notion_page_id>    # LLM-canonicalize, sparar resolved-<id>.json
npm run cart-from-resolved -- <notion_page_id> # POST till Willys cart

# Bulk
npm run sync-ingredients          # LLM-canonicaliserar ALLA recept i Supabase

# Weekly
npm run weekly-plan                            # ranker visar 7+1
npm run weekly-build -- <id1> <id2> <id3> <id4> # konsoliderar
npm run cart-from-weekly                       # POSTar konsoliderade

# Cart-mvp (legacy från Phase 1, hardcoded JSON)
npm run cart-mvp

# Dev
npm run dev                       # localhost:3000, /handla för veckoplan
```

Session-slut. Ny session ska börja med att läsa denna fil + check git-status i frysen.
