# Session: 2026-05-14 14:21

Long session spänd över 2026-05-12 → 14. Doginwork quiz B-variant offer-page polish, mobile-walk-audit, plus inventory + planning för Klaviyo-migration.

## What was done

### Offer page B-variant polish (commit 78e0d5a)
- Återställde visuell rikedom på B-variant offer-page som tidigare LLM hade strippat till plain text:
  - Testimonials: 3 before/after-foto-cards med horisontell scroll (Bella/Loke/Sigge) - tidigare bara text-quotes
  - QUIZ2026-coupon: flyttad in i orange-bordered "DITT ERBJUDANDE" final-pricing-box med check-cirkel
  - Marie-sektion utökad: `marie-credentials.webp` collage + 3-paragraf failure-story
  - Bonus-bilder: riktiga `bonus-{1,2,3,4}-*.webp` istället för emojis (📋💬🏆🎧)
  - Final pricing: lade tillbaka "1 999 kr" struck-through + full value-stack (Hela Valpakademin 6 988 / 4 bonusar 2 188 / Totalt 9 176 struck)
  - Garanti: `marie-guarantee-badge.webp` istället för 🛡️ emoji
- Bibehöll B-hypotesen: personal hero ({name}/{age}/{primary_pain_value}), age-conditional urgency, dynamic deadline today+2, sticky bottom CTA

### FAQ-expansion (båda varianter)
- A-variant: 5 → 11 frågor
- B-variant: 3 → 11 frågor (now identical to A, eliminates confounder)
- 6 nya frågor baserat på [01-avatar.md](doginwork/docs/01-avatar.md) invändningar: Marie self-proclaimed expert / fysisk valpkurs / godis funkar inte / fastnar var vänder jag mig / när tillgång efter köp / vuxna hundar
- Patcher: `patch_offer_a_faq.py` (sentinel-idempotent), `patch_offer_b.py` (file-driven)

### Mobile-walk audit (375x667 iPhone SE)
Walkade 22 steg via Claude in Chrome + Playwright. Hittade:
1. **BUG #1**: "plan"-ordet baked-in på ≥4 ställen (subhead Block 4, Step 20/21 headlines, offer-page eyebrow A+B) - bryter CLAUDE.md hard rule "kurs inte plan". William: låt vara (LP själv använder "plan").
2. **BUG #2**: Sticky CTA dolde rad 5+ på multi-select med många options. William ville bildbevis - levererade. **Sen löste vi det genom att ta bort sticky-CTA helt** (lägger sig inline efter sista option).
3. **ISSUE #3**: "3 000+ valpägare"-claim - lifetime spend ger ~217 köp, 3000+ är hög. William: skit i det.
4. Grammar fix: "Markera bara de som Bella kan ordentligt" (saknade "som") - fixad via [patch_grammar_b11.py](doginwork/scripts/patch_grammar_b11.py).

### Cart abandonment investigation
- Klarna under-fold (322px scroll), Kontokort default - William: kan inte påverka
- Marketing email-checkbox pre-checked - William: skit i det
- 6 adressfält för digital produkt - William: krävs, låt vara
- 11 abandoned checkouts / 51 köp senaste 30 dagar = 17.7% rate

### Quiz UX-fixar (commit 78e0d5a)
- Block 9 (Beteendeproblem) tillbaka till `image_list`-layout (PawChamp-style rader, 56x56 thumbnails) - hade regression:at till `image_cards` 2-col grid via Woofz-commit 3d8ec05
- Lade till `image_list` som ny layout-värde i types/renderer
- Tog bort sticky CTA överallt: `.quiz-question-bottom` + `.quiz-continue-wrap` är nu inline
- Tog bort fade-gradient + ScrollMoreHint-komponent (försök som blev stökigt innan vi enades om att bara skippa sticky)
- Ny `skipLabel?: string` på text_input. "Hoppa över" på Bella-namn-step (EveryDoggy-mönster)

### Klaviyo-onboarding
- Klaviyo Private API Key sparad i [.env.local](content-hub/.env.local) som `KLAVIYO_DOGINWORK_API_KEY`
- Inventerade kontot: 300+ profiler synkade från Shopify, 0 segments, 0 templates, 0 campaigns, 1 obsolet draft-flow ("Köpt privat coaching"). Standard Shopify-metrics aktiva (Placed Order, Checkout Started). Onsite tracking installerad.
- Identifierade Shopify Flow abandoned checkout-mejlets problem: visar 1999 kr (inte 997 kr quiz-rabatt), fabricated testimonials ("Jessica L." / "Eric M." - finns ej i avatar.md-biblioteket), "Marie's" engelsk genitiv, "lydnad" (bryter hard rule), bara 1 mejl (saknar 24h+72h)

## Decisions made

1. **Drop sticky CTA over fade-gradient + scroll-hint pill workaround** - william såg igenom min over-engineering, "kan vi inte bara strunta i sticky?". Resulterade i 50+ rader CSS borttagen + cleaner UX.
2. **image_list som ny layout-värde** (vs adaptiv image_cards baserat på option-count) - explicit DB-prop bättre än magic threshold.
3. **Inkluderade pre-existing Clarity-tracker-ändringar i samma commit** som mina quiz-changes - de var Williams arbete oavkomitt, hörde ihop tematiskt med quiz-publishing.
4. **Bygg cart abandon flow i Klaviyo, inte i Shopify Flow** - Shopify Flow mejlet har 6 issues (fab testimonials, fel pris, lydnad-ord, etc), 0 attribution, ingen variant-styrning. Bygg om från scratch i Klaviyo med Maries verifierade voice + 3-mejls sequence.
5. **Skippa email-capture i quiz tills Klaviyo-flow byggt** - utan ESP är capture pure cost.

## Current state

### Live ✓
- A/B-testet på offer-page rullar (50/50 split) på `quiz.doginwork.se/valpakademin`
- Båda varianter har identisk 11-FAQ, identiska visuella komponenter (testimonials/coupon/Marie/bonusar/pris/garanti)
- Mobile UX: image_list rader för Block 9, non-sticky CTA, Hoppa över på namn
- Klaviyo API connected, kontot tomt men foundation finns
- Shopify Flow "Recover abandoned checkout" rullar fortfarande (planerat att stänga när Klaviyo-version aktiveras)

### Aktiva test
- LP-A/B (control vs specific) sedan 2026-05-03
- Offer-page-A/B (rich v20 vs personalized v21) sedan 2026-05-12

## Blockers / Open questions

- Sample size för A/B-tester: ~700 sessions/mån, ~35 köp/mån. För statistisk signifikans på offer-test ensamt behövs ~5-6 månader trafik. Realistisk dataffrekvens = 1-2 veckors kollar.
- Klaviyo-Shopify profile sync: 300+ av 698 profiler synkade. Otydligt om pågående eller stopped. Behöver verifieras innan vi triggar campaign.
- "Plan" vs "kurs"-inkonsistens: LP använder "personliga träningsplan" som titel; quiz-runtime CLAUDE.md säger "kurs inte plan". William: låt vara - kanske revidera hard rule när vi ändå skriver om en av dem.
- Klaviyo Connector i claude.ai/directory/connectors: William aktiverade men oklart om det ger Claude Code-session access till verktygen, eller bara claude.ai-chat.

## Next up

1. **HIGH: Bygg cart abandonment flow i Klaviyo** (3 mejl, korrekt pris, Maries voice, riktiga testimonials) - största läckaget (44% av offer-clickers).
2. **HIGH: Stäng av Shopify Flow** "Recover abandoned checkout" när Klaviyo-version aktiverad.
3. **MEDIUM: 8 quiz-pain-segments i Klaviyo** + wire quiz-runtime att pusha events via Klaviyo Profiles API med qz_pain/qz_breed/qz_age properties.
4. **MEDIUM: Post-quiz email-flow** (kräver email-capture-step i quiz - separat beslut).
5. **LOW: Verifiera Klaviyo-Shopify sync** (300 vs 698 - är resten på väg eller stuck?).
6. **LOW: Email-template-bibliotek** i Maries voice för broadcast-kampanjer.
