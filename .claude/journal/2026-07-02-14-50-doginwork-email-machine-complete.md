# Session: 2026-07-02 14:50 (doginwork email-maskinen: welcome flow + sending domain + popup - KOMPLETT & VERIFIERAD)

NOTE: doginwork/Klaviyo/DNS/LP-arbete - ingen content-hub-kod ändrad (bara scripts körda). Fortsättning på morgonsessionen (2026-07-02-08-36).

## Slutläge: hela kedjan LIVE och verifierad end-to-end
Popup (/valpkurs, 60% scroll) → Email List → Welcome flow v3 (5 mejl) → /valpkurs-erbjudande. Verifierat med riktig signup (mail 1 inom minuten) + **mail-tester.com 9.1/10** (SPF/DKIM/DMARC pass, ej blocklistad; enda avdrag URIBL_GREY = Klaviyos delade kmail-lists-unsubscribe-domän, ej åtgärdbart utan betald plan).

## Vad som gjordes (kronologiskt)
1. **Welcome flow byggd via Klaviyo API** (flows-API:et stödjer CREATE, ej update - se `memory/klaviyo-doginwork.md` för alla lessons). Slutversion: **"Welcome flow - Valpakademin v3" id `WqdBSV`, LIVE**. Trigger Added to List `XYhkt2`, filter Placed Order=0 sedan flow-start, delays 1/2/2/2d (=dag 0,1,3,5,7), Smart Sending av på mail 1. Avsändare "Marie på Doginwork" info@doginwork.com.
2. **Copy: Genesis-pipeline funkar.** `universal-email-bot` (Copy Coders, via gas.copycoders.ai, se `src/lib/genesis.ts`) skrev om hela flowen → svengelska-tvätt → Williams review. Format: en mening per rad, fetstil, P.S.-teasers (open loops), svart CTA-knapp per mejl. Finala copyn: `Vault/outputs/doginwork-welcome-flow-text-v3.md`. Williams fixar: hunden = HANE, "Jag är hundtränare" (presens), inga "Vi ses inne"/"Mer från mig i morgon"-anglicismer, inga [NAMN] (popup samlar bara email).
3. **Branded sending domain LIVE**: `send.doginwork.com` (Static routing - Dynamic OMÖJLIGT, Hostinger stödjer inte NS-poster i API eller UI). 3 CNAMEs + verifierings-TXT via Hostinger API. Email List bytt till single_opt_in. DMARC p=none fanns. Hostinger-API kräver User-Agent (Python-urllib → 403).
4. **Klaviyo-snippet på LP:erna lagad**: båda sidorna hade placeholder `REPLACE_WITH_KLAVIYO_PUBLIC_KEY` → `Ryf7xC` i `doginwork/scripts/sales_page_html_body.py` + republicerat (publish funkar från `.worktrees/valpkurs-sales-page`).
5. **Unlock-mekaniken BORTTAGEN från /valpkurs** (Williams beslut): localStorage/?unlock=1/klaviyoForms-listener rivna. /valpkurs = alltid 1 499/VALP500, /valpkurs-erbjudande = alltid 997/VALP2026. Ett pris per sida, noll drift-risk.
6. **Email List städad på riktigt**: 296 gamla suppressade Shopify-sync-medlemmar borttagna ur listan (suppression tog aldrig bort MEDLEMSKAP → "Added to List"-triggern fyrade inte för återvändare - det var därför Williams första test inte gav mail). Kvar i listan: William + utterstrom.anna@telia.com (första riktiga subscribern? joined 2/7 11:45).

## Beslut
- **Abandonment-flow SKIPPAS** - welcome flow täcker checkout-lämnare som gett email via popup/checkout.
- **/valpkurs är ett fullpris-test** (1 499-ankare). Popup medvetet sen (60% scroll + ~12s delay, William höjde själv). Rabattkoderna mäter: VALP500=fullpris-väg, VALP2026=popup-väg.
- Popup-targeting: Containing `pages.doginwork.se/valpkurs/` (slutsnedstrecket är det som exkluderar erbjudande-sidan). Exactly matching utan wildcard/snedstreck firar ALDRIG (308-redirect + fbclid).

## Gotchas upptäckta (alla i memory-filer)
- Klaviyo flow-definitioner är create-only via API; flowens templates är kloner som inte kan PATCHAs → ändring = delete+recreate (nytt flow-id varje gång).
- Klaviyo-popupens triggers är AND-ade (delay + scroll). COOKIE_TIMEOUT 5d - testa alltid i nytt inkognito. `window._klOnsite.push(['openForm','TNPi5P'])` öppnar formen programmatiskt (bra för test).
- `{% unsubscribe "Avsluta prenumerationen" %}` för svensk länktext.
- Williams Chrome blockerar static.klaviyo.com (tillägg) - testa aldrig popups i hans vanliga browser.

## Next up
1. **META ADS I HUBBEN → trafik till pages.doginwork.se/valpkurs/** (Williams uttalade nästa steg. doginwork-workspace `0150243c...`, ad account `act_1717487069061328`, Genesis-bots + Concept Push finns i hubben. OBS: template-adsets/campaign-mappings för doginwork är troligen INTE konfigade i Settings än - kolla först.)
2. William: håll koll att mail 2-5 rullar (dag 1/3/5/7) + VALP500-vs-VALP2026-fördelningen i Shopify-ordrar.
3. Senare: post-purchase-mejl (onboarding + review), arkivera gamla draft-flowsen (WcWF9h, YyVCRG), gammal advertorial-LP:s "16 moduler" (osynk med 11/55+), DMARC rua-monitorering när volymen växer.
