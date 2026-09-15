# Envana: fullskärmssidan för progressbildsflödet

QR-koden på kortet i paketet pekar hit. Sidan ska INTE se ut som en
butikssida - den är en app-onboarding, och butikens header, footer och
annonsbar skulle bryta den illusionen direkt.

## Så är det byggt

| Del | Var |
|---|---|
| Sidan | shopenvana.com/pages/resa (`template_suffix: resa`) |
| Layout | `layout/resa.liquid` i temat `envana-theme/main` |
| Template | `templates/page.resa.liquid` |
| Formuläret | laddas från hubben, `forms-embed/v1.js` |

Sidans `body_html` är **tom** med flit. Embedden ligger i templaten, inte i
sidans innehåll, eftersom Shopify sanerar bort `<script>` ur `body_html` -
ett inbakat skript kapades till 335 tecken och kastade syntaxfel.

## Varför en egen layout och inte bara dold CSS

En sektion går att dölja, men layouten runt omkring renderas ändå och tar
höjd. `layout/resa.liquid` renderar bara `content_for_header` (obligatorisk,
och det är där cookie-bannern och appskripten hamnar) plus
`content_for_layout`. Inget annat.

**Cookie-bannern ligger kvar.** Den är Shopifys egen och lagkrav i EU, så
den ska vara det. Den visas en gång och täcker då nedre halvan av första
skärmen.

## Åtkomst

Butiken är `n5ftzr-mq.myshopify.com`. Token hämtas med client_credentials ur
`Envana Shopify App` i 1Password-valvet Dropship - samma flöde som
`src/lib/shopify.ts` redan använder för de andra butikerna. Valvet har app-id
och secret (`shpss_`), INTE ett färdigt `shpat_`; det hämtas vid behov och
lever 24 timmar.

Scopes som appen har: write_content, write_themes, write_products,
write_publications, write_discounts, write_online_store_navigation,
write_legal_policies, read_orders.

## Om något ser fel ut efter en ändring

Shopifys CDN cachar tema-assets hårt och serverade en gammal fil i flera
minuter efter uppladdning. Använd `public_url` från assets-API:t, den bär en
`?v=`-stämpel.
