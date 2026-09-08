# expertpanelen.se - generator för testsidan

`python3 build.py` läser `site.json` (text, panel, kriterier, FAQ, källor) och
`products.json` (produkter i rangordning, delbetyg, texter) och skriver
`kollagen-bast-i-test.html`. Byggskriptet vägrar om ordningen i products.json
inte matchar de uträknade totalbetygen.

Publicera: `npx tsx scripts/expertpanelen-publish.ts scripts/expertpanelen/kollagen-bast-i-test.html kollagen-bast-i-test scripts/expertpanelen/public`
(kör från content-hub-roten). Skriptet upsertar pages/translations i
arbetsytan `expertpanelen` och deployar via `runWithCfProjectOverride`.

`produktdata/` är råfakta hämtade från butikssidorna 2026-09-08 (pris, dos,
ingredienser, bild-URL) med uträkningar i `notes`. Uppdatera dem innan
products.json ändras. `redaktion/` är panelens porträtt (AI-genererade).
Research och konkurrentanalys: `~/Obsidian/SharedVault/envana/expertpanelen/`.
