/**
 * Starter HTML templates for SEO blog articles.
 * These provide well-structured content scaffolding for common article formats.
 * The user fills in actual content via the page builder.
 *
 * SEO patterns baked in:
 * - TL;DR section at top (reduces bounce rate, good for featured snippets)
 * - H2s as questions where natural (Google featured snippet targeting)
 * - Inline source citation reminders (YMYL trust signals, every ~150-200 words)
 * - Internal linking placeholders
 * - FAQ section with .faq-item structure (auto-extracted to FAQPage JSON-LD)
 */

export interface BlogTemplate {
  id: string;
  name: string;
  /** Short description shown in template picker */
  description: string;
  /** Category tag */
  category: string;
  /** Returns full HTML document with placeholder content */
  getHtml: (articleName: string) => string;
}

const sharedStyles = `
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1f2937; line-height: 1.7; }
    .article { max-width: 720px; margin: 0 auto; padding: 24px 20px 60px; }
    h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 12px; }
    h2 { font-size: 1.4rem; margin: 40px 0 12px; color: #111827; }
    h3 { font-size: 1.15rem; margin: 28px 0 8px; }
    p { margin: 0 0 16px; }
    img { max-width: 100%; height: auto; border-radius: 8px; }
    .hero-img { width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: 12px; margin: 0 0 24px; }
    .section-img { width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: 8px; margin: 24px 0; }
    .intro { font-size: 1.1rem; color: #374151; margin: 0 0 32px; }
    .tldr { background: #f0f9ff; border-left: 4px solid #0284c7; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 0 0 32px; }
    .tldr strong { display: block; margin-bottom: 6px; color: #0369a1; }
    .product-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin: 0 0 20px; }
    .product-card h3 { margin: 0 0 8px; }
    .product-card .verdict { font-weight: 600; color: #059669; }
    .pros-cons { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 12px 0 16px; }
    .pros-cons ul { margin: 0; padding-left: 18px; }
    .pros h4 { color: #059669; margin: 0 0 8px; }
    .cons h4 { color: #dc2626; margin: 0 0 8px; }
    .cta-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center; margin: 32px 0; }
    .cta-box a { display: inline-block; background: #059669; color: #fff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; }
    .info-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 24px 0; }
    .faq-item { margin: 0 0 20px; }
    .faq-item h3 { margin: 0 0 6px; font-size: 1.05rem; }
    .faq-item p { margin: 0; color: #4b5563; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 0.9rem; }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; }
    .vs-table { margin: 24px 0; }
    .score { display: inline-block; background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-weight: 600; font-size: 0.85rem; }
    .timeline { border-left: 3px solid #e5e7eb; padding-left: 24px; margin: 24px 0; }
    .timeline-entry { position: relative; margin: 0 0 28px; }
    .timeline-entry::before { content: ""; position: absolute; left: -30px; top: 6px; width: 12px; height: 12px; border-radius: 50%; background: #059669; border: 2px solid #fff; box-shadow: 0 0 0 2px #059669; }
    .timeline-entry h3 { margin: 0 0 6px; color: #059669; }
    .quote-block { background: #faf5ff; border-left: 4px solid #a855f7; padding: 16px 20px; border-radius: 0 8px 8px 0; margin: 24px 0; font-style: italic; }
    .quote-block .attribution { font-style: normal; font-weight: 600; color: #7c3aed; margin-top: 8px; font-size: 0.9rem; }
    .results-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin: 24px 0; }
    .results-box h3 { margin: 0 0 12px; color: #059669; }
    .results-box ul { margin: 0; padding-left: 18px; }
    .results-box li { margin-bottom: 6px; }
    .before-after { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 24px 0; }
    .before-after .label { font-weight: 600; text-align: center; margin-bottom: 8px; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .before-after .before .label { color: #9ca3af; }
    .before-after .after .label { color: #059669; }
    @media(max-width: 640px) { .pros-cons { grid-template-columns: 1fr; } .article { padding: 16px; } .before-after { grid-template-columns: 1fr; } }
  </style>
`;

export const BLOG_TEMPLATES: BlogTemplate[] = [
  {
    id: "listicle",
    name: "Bäst i test",
    description: "Product roundup/listicle — THE dominant SEO format in Scandinavia",
    category: "Produktguider",
    getHtml: (name) => `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)}</title>
  ${sharedStyles}
</head>
<body>
  <div class="article">
    <h1>${esc(name)}</h1>
    <p class="intro">Vi har testat och jämfört de mest populära alternativen på marknaden. Här är våra rekommendationer efter veckor av noggranna tester.</p>

    <div class="tldr">
      <strong>Kort sammanfattning (TL;DR)</strong>
      <p>Bäst totalt: <strong>Produkt 1</strong> — bäst kombination av kvalitet och pris. Bäst budget: <strong>Produkt 2</strong>. Bäst premium: <strong>Produkt 3</strong>.</p>
    </div>

    <img class="hero-img" src="https://placehold.co/1200x675/f3f4f6/9ca3af?text=Produktbild" alt="Produktjämförelse">

    <div class="info-box">
      <strong>Så testar vi:</strong> Vi köper alla produkter själva och testar dem under minst 2 veckor innan vi gör vårt omdöme. Ingen tillverkare har inflytande över våra resultat.
    </div>

    <h2>Vilka produkter är bäst i test 2026?</h2>
    <p>Vi har testat X produkter och valt ut de tre bästa. Här är en snabb översikt innan vi går in på detaljerna.</p>
    <table>
      <tr><th>Produkt</th><th>Bäst för</th><th>Betyg</th></tr>
      <tr><td>Produkt 1</td><td>Bäst totalt</td><td><span class="score">9.2/10</span></td></tr>
      <tr><td>Produkt 2</td><td>Bäst budget</td><td><span class="score">8.5/10</span></td></tr>
      <tr><td>Produkt 3</td><td>Bäst premium</td><td><span class="score">8.8/10</span></td></tr>
    </table>

    <h2>Varför valde vi just dessa produkter?</h2>
    <p>Urvalet baseras på X kriterier. Enligt <a href="#">en oberoende undersökning från [källa]</a> är faktor Y den viktigaste aspekten vid val av [produkt].</p>

    <h2>1. Produkt 1 — Bäst i test totalt</h2>
    <div class="product-card">
      <h3>Produkt 1</h3>
      <p class="verdict">Vårt omdöme: Bäst totalt 2026</p>
      <p>Beskriv produkten och din upplevelse. Vad gör den bra? Vem passar den för?</p>
      <div class="pros-cons">
        <div class="pros"><h4>Fördelar</h4><ul><li>Fördel 1</li><li>Fördel 2</li><li>Fördel 3</li></ul></div>
        <div class="cons"><h4>Nackdelar</h4><ul><li>Nackdel 1</li><li>Nackdel 2</li></ul></div>
      </div>
    </div>

    <h2>2. Produkt 2 — Bäst budget</h2>
    <div class="product-card">
      <h3>Produkt 2</h3>
      <p class="verdict">Vårt omdöme: Bäst för priset</p>
      <p>Beskriv produkten och din upplevelse.</p>
      <div class="pros-cons">
        <div class="pros"><h4>Fördelar</h4><ul><li>Fördel 1</li><li>Fördel 2</li></ul></div>
        <div class="cons"><h4>Nackdelar</h4><ul><li>Nackdel 1</li><li>Nackdel 2</li></ul></div>
      </div>
    </div>

    <h2>3. Produkt 3 — Bäst premium</h2>
    <div class="product-card">
      <h3>Produkt 3</h3>
      <p class="verdict">Vårt omdöme: Bäst premium-alternativ</p>
      <p>Beskriv produkten och din upplevelse.</p>
      <div class="pros-cons">
        <div class="pros"><h4>Fördelar</h4><ul><li>Fördel 1</li><li>Fördel 2</li></ul></div>
        <div class="cons"><h4>Nackdelar</h4><ul><li>Nackdel 1</li><li>Nackdel 2</li></ul></div>
      </div>
    </div>

    <div class="cta-box">
      <p><strong>Vår topprekommendation</strong></p>
      <a href="#">Se bästa pris →</a>
    </div>

    <h2>Hur väljer du rätt produkt?</h2>
    <p>Här går vi igenom de viktigaste faktorerna att tänka på innan du bestämmer dig.</p>
    <h3>Faktor 1</h3>
    <p>Förklara den första faktorn. Länka till <a href="#">relevant studie eller källa</a> som stödjer dina påståenden.</p>
    <h3>Faktor 2</h3>
    <p>Förklara den andra faktorn.</p>

    <p><em>Läs även: <a href="#">Relaterad artikel på bloggen</a></em></p>

    <h2>Vanliga frågor</h2>
    <div class="faq-item">
      <h3>Fråga 1?</h3>
      <p>Svar på fråga 1.</p>
    </div>
    <div class="faq-item">
      <h3>Fråga 2?</h3>
      <p>Svar på fråga 2.</p>
    </div>
    <div class="faq-item">
      <h3>Fråga 3?</h3>
      <p>Svar på fråga 3.</p>
    </div>
  </div>
</body>
</html>`,
  },

  {
    id: "problem-solution",
    name: "Problem & lösning",
    description: "Problem-focused article — great for long-tail health/pain keywords",
    category: "Hälsa",
    getHtml: (name) => `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)}</title>
  ${sharedStyles}
</head>
<body>
  <div class="article">
    <h1>${esc(name)}</h1>
    <p class="intro">Många lider av detta problem utan att veta att det finns enkla lösningar. I den här artikeln går vi igenom orsaker, forskning och konkreta tips som faktiskt fungerar.</p>

    <div class="tldr">
      <strong>Kort sammanfattning (TL;DR)</strong>
      <p>Problemet beror oftast på [orsak]. De mest effektiva lösningarna är [lösning 1] och [lösning 2], enligt <a href="#">forskning från [källa]</a>. Sökvård om [varningssignal].</p>
    </div>

    <img class="hero-img" src="https://placehold.co/1200x675/f3f4f6/9ca3af?text=Artikelbild" alt="Illustration">

    <h2>Vad orsakar [problemet]?</h2>
    <p>Beskriv problemet. Hur vanligt är det? Vilka drabbas? Enligt <a href="https://www.1177.se/">1177 Vårdguiden</a> drabbas ungefär X% av befolkningen.</p>

    <div class="info-box">
      <strong>Viktigt att veta:</strong> Denna artikel är informativ och ersätter inte medicinsk rådgivning. Kontakta alltid din vårdgivare vid ihållande besvär.
    </div>

    <h2>Vilka är de vanligaste orsakerna?</h2>
    <h3>Orsak 1</h3>
    <p>Förklara den första orsaken och hur den bidrar till problemet. Citera <a href="#">relevant studie</a>.</p>
    <h3>Orsak 2</h3>
    <p>Förklara den andra orsaken.</p>
    <h3>Orsak 3</h3>
    <p>Förklara den tredje orsaken.</p>

    <h2>Vad säger forskningen?</h2>
    <p>En studie publicerad i <a href="#">[tidskrift, år]</a> med X deltagare visade att [resultat]. En annan studie från <a href="#">[universitet/institution]</a> bekräftade att [resultat].</p>

    <h2>Hur löser du problemet? 5 konkreta tips</h2>
    <h3>1. Första tipset</h3>
    <p>Beskriv det första tipset i detalj. Varför fungerar det? Hur gör man?</p>
    <h3>2. Andra tipset</h3>
    <p>Beskriv det andra tipset.</p>
    <h3>3. Tredje tipset</h3>
    <p>Beskriv det tredje tipset.</p>
    <h3>4. Fjärde tipset</h3>
    <p>Beskriv det fjärde tipset. Citera <a href="#">ytterligare en källa</a> för trovärdighet.</p>
    <h3>5. Femte tipset</h3>
    <p>Beskriv det femte tipset.</p>

    <p><em>Läs även: <a href="#">Relaterad artikel på bloggen</a></em></p>

    <div class="cta-box">
      <p><strong>Vår rekommendation</strong></p>
      <p>En kort sammanfattning av vad vi rekommenderar.</p>
      <a href="#">Läs mer →</a>
    </div>

    <h2>När bör du söka vård?</h2>
    <p>Beskriv varningssignaler. Enligt <a href="https://www.1177.se/">1177 Vårdguiden</a> bör du kontakta vården om...</p>

    <h2>Vanliga frågor</h2>
    <div class="faq-item">
      <h3>Fråga 1?</h3>
      <p>Svar på fråga 1.</p>
    </div>
    <div class="faq-item">
      <h3>Fråga 2?</h3>
      <p>Svar på fråga 2.</p>
    </div>
    <div class="faq-item">
      <h3>Fråga 3?</h3>
      <p>Svar på fråga 3.</p>
    </div>

    <h2>Sammanfattning</h2>
    <p>En kort sammanfattning av artikelns viktigaste punkter.</p>
  </div>
</body>
</html>`,
  },

  {
    id: "buying-guide",
    name: "Köpguide",
    description: "How-to-choose guide — authoritative buyer education content",
    category: "Guider",
    getHtml: (name) => `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)}</title>
  ${sharedStyles}
</head>
<body>
  <div class="article">
    <h1>${esc(name)}</h1>
    <p class="intro">Att välja rätt kan vara svårt med alla alternativ på marknaden. Den här guiden hjälper dig att hitta precis den produkt som passar dina behov.</p>

    <div class="tldr">
      <strong>Kort sammanfattning (TL;DR)</strong>
      <p>De viktigaste faktorerna vid val av [produkt] är [faktor 1], [faktor 2] och [faktor 3]. För de flesta rekommenderar vi mellanprissegmentet (XXX–XXX kr).</p>
    </div>

    <img class="hero-img" src="https://placehold.co/1200x675/f3f4f6/9ca3af?text=Guidebild" alt="Köpguide">

    <h2>Vad ska man tänka på vid köp av [produkt]?</h2>
    <ul>
      <li><strong>Faktor 1:</strong> Kort sammanfattning av varför det är viktigt</li>
      <li><strong>Faktor 2:</strong> Kort sammanfattning</li>
      <li><strong>Faktor 3:</strong> Kort sammanfattning</li>
      <li><strong>Budget:</strong> Vad bör man räkna med att betala?</li>
    </ul>

    <h2>Vilken typ passar dig?</h2>
    <h3>Typ A — för dig som...</h3>
    <p>Beskriv vilken typ av köpare detta passar. Vad ska man prioritera?</p>
    <h3>Typ B — för dig som...</h3>
    <p>Beskriv den andra typen.</p>
    <h3>Typ C — för dig som...</h3>
    <p>Beskriv den tredje typen.</p>

    <h2>Hur viktig är [faktor 1]?</h2>
    <p>Djupgående förklaring. Enligt <a href="#">[källa]</a> visar forskning att denna faktor påverkar [resultat].</p>

    <h2>Spelar [faktor 2] någon roll?</h2>
    <p>Djupgående förklaring av den andra faktorn.</p>

    <h2>Vad sägs om [faktor 3]?</h2>
    <p>Djupgående förklaring av den tredje faktorn.</p>

    <p><em>Läs även: <a href="#">Relaterad artikel på bloggen</a></em></p>

    <h2>Vad kostar det?</h2>
    <table>
      <tr><th>Segment</th><th>Prisintervall</th><th>Vad får man?</th></tr>
      <tr><td>Budget</td><td>XXX–XXX kr</td><td>Grundläggande funktion</td></tr>
      <tr><td>Mellanpris</td><td>XXX–XXX kr</td><td>Bra balans kvalitet/pris</td></tr>
      <tr><td>Premium</td><td>XXX+ kr</td><td>Bästa material och funktion</td></tr>
    </table>

    <div class="info-box">
      <strong>Vårt tips:</strong> För de flesta rekommenderar vi mellanprissegmentet — du får betydligt bättre kvalitet utan att behöva betala toppris.
    </div>

    <h2>Vilka misstag bör man undvika?</h2>
    <p><strong>Misstag 1:</strong> Beskriv ett vanligt misstag och varför det är dåligt.</p>
    <p><strong>Misstag 2:</strong> Beskriv ett till vanligt misstag.</p>
    <p><strong>Misstag 3:</strong> Beskriv ett tredje misstag.</p>

    <div class="cta-box">
      <p><strong>Redo att köpa?</strong></p>
      <p>Se vårt test av de bästa alternativen 2026.</p>
      <a href="#">Se bäst i test →</a>
    </div>

    <h2>Vanliga frågor</h2>
    <div class="faq-item">
      <h3>Fråga 1?</h3>
      <p>Svar på fråga 1.</p>
    </div>
    <div class="faq-item">
      <h3>Fråga 2?</h3>
      <p>Svar på fråga 2.</p>
    </div>
  </div>
</body>
</html>`,
  },

  {
    id: "comparison",
    name: "Jämförelse (A vs B)",
    description: "Head-to-head product comparison — targets \"X vs Y\" searches",
    category: "Jämförelser",
    getHtml: (name) => `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)}</title>
  ${sharedStyles}
</head>
<body>
  <div class="article">
    <h1>${esc(name)}</h1>
    <p class="intro">Vilken är bäst — Produkt A eller Produkt B? Vi har testat båda och jämfört dem sida vid sida. Här är vår ärliga bedömning.</p>

    <div class="tldr">
      <strong>Kort sammanfattning (TL;DR)</strong>
      <p><strong>Välj Produkt A</strong> om du prioriterar [egenskap]. <strong>Välj Produkt B</strong> om du prioriterar [egenskap]. För de flesta rekommenderar vi Produkt X.</p>
    </div>

    <img class="hero-img" src="https://placehold.co/1200x675/f3f4f6/9ca3af?text=A+vs+B" alt="Jämförelse">

    <h2>Hur skiljer sig Produkt A från Produkt B?</h2>
    <table class="vs-table">
      <tr><th>Egenskap</th><th>Produkt A</th><th>Produkt B</th></tr>
      <tr><td>Pris</td><td>XXX kr</td><td>XXX kr</td></tr>
      <tr><td>Material</td><td>Material A</td><td>Material B</td></tr>
      <tr><td>Vikt</td><td>X kg</td><td>X kg</td></tr>
      <tr><td>Garanti</td><td>X år</td><td>X år</td></tr>
      <tr><td><strong>Betyg</strong></td><td><span class="score">X/10</span></td><td><span class="score">X/10</span></td></tr>
    </table>

    <h2>Vad är Produkt A bäst på?</h2>
    <p>Beskriv Produkt A. Vilka är dess styrkor och svagheter? Citera <a href="#">relevant källa</a> om tillämpligt.</p>
    <div class="pros-cons">
      <div class="pros"><h4>Fördelar</h4><ul><li>Fördel 1</li><li>Fördel 2</li></ul></div>
      <div class="cons"><h4>Nackdelar</h4><ul><li>Nackdel 1</li><li>Nackdel 2</li></ul></div>
    </div>

    <h2>Vad är Produkt B bäst på?</h2>
    <p>Beskriv Produkt B. Vilka är dess styrkor och svagheter?</p>
    <div class="pros-cons">
      <div class="pros"><h4>Fördelar</h4><ul><li>Fördel 1</li><li>Fördel 2</li></ul></div>
      <div class="cons"><h4>Nackdelar</h4><ul><li>Nackdel 1</li><li>Nackdel 2</li></ul></div>
    </div>

    <h2>Hur presterar de i praktiken?</h2>
    <h3>Komfort</h3>
    <p>Jämför de båda produkterna avseende komfort.</p>
    <h3>Material & kvalitet</h3>
    <p>Jämför material och byggkvalitet.</p>
    <h3>Pris & värde</h3>
    <p>Jämför pris i förhållande till vad man får.</p>

    <p><em>Läs även: <a href="#">Relaterad artikel på bloggen</a></em></p>

    <h2>Vilken ska du välja?</h2>
    <p><strong>Välj Produkt A om:</strong> Du prioriterar [egenskap].</p>
    <p><strong>Välj Produkt B om:</strong> Du prioriterar [egenskap].</p>

    <div class="info-box">
      <strong>Vår rekommendation:</strong> För de flesta tycker vi att [Produkt X] är det bästa valet tack vare [anledning].
    </div>

    <div class="cta-box">
      <a href="#">Se bästa pris →</a>
    </div>

    <h2>Vanliga frågor</h2>
    <div class="faq-item">
      <h3>Är Produkt A bättre än Produkt B?</h3>
      <p>Svar.</p>
    </div>
    <div class="faq-item">
      <h3>Vilken har bäst pris?</h3>
      <p>Svar.</p>
    </div>
  </div>
</body>
</html>`,
  },

  {
    id: "science",
    name: "Forskningsartikel",
    description: "Evidence-based deep dive — builds E-E-A-T trust for YMYL topics",
    category: "Forskning",
    getHtml: (name) => `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)}</title>
  ${sharedStyles}
</head>
<body>
  <div class="article">
    <h1>${esc(name)}</h1>
    <p class="intro">Vad säger egentligen forskningen? Vi har gått igenom de senaste studierna och sammanfattar vad vetenskapen visar — utan överdrifter.</p>

    <div class="tldr">
      <strong>Kort sammanfattning (TL;DR)</strong>
      <p>Forskningen visar att [huvudslutsats]. Evidensnivån är [stark/måttlig/svag] baserat på [antal studier]. Den viktigaste insikten: [insikt].</p>
    </div>

    <img class="hero-img" src="https://placehold.co/1200x675/f3f4f6/9ca3af?text=Forskning" alt="Forskning">

    <div class="info-box">
      <strong>Vetenskaplig artikel:</strong> Denna artikel sammanfattar publicerade studier. Vi refererar till originalkällorna så att du kan verifiera informationen själv. Artikeln är inte medicinsk rådgivning.
    </div>

    <h2>Vad vet vi sedan tidigare?</h2>
    <p>Ge kontext. Varför är detta ämne intressant? Vad har vi vetat hittills? Enligt <a href="#">[källa]</a> har forskningen länge visat att...</p>

    <h2>Vad visar de senaste studierna?</h2>
    <h3>Studie 1: [Titel/Årtal]</h3>
    <p>Sammanfatta studien: vem forskade, hur stor var studien, vad mätte de, och vad blev resultatet? <a href="#">Länk till studien</a>.</p>

    <h3>Studie 2: [Titel/Årtal]</h3>
    <p>Sammanfatta studien. <a href="#">Länk till studien</a>.</p>

    <h3>Studie 3: [Titel/Årtal]</h3>
    <p>Sammanfatta studien. <a href="#">Länk till studien</a>.</p>

    <h2>Hur stark är evidensen?</h2>
    <table>
      <tr><th>Påstående</th><th>Evidensnivå</th><th>Slutsats</th></tr>
      <tr><td>Påstående 1</td><td><span class="score">Stark</span></td><td>Stöds av flera studier</td></tr>
      <tr><td>Påstående 2</td><td><span class="score">Måttlig</span></td><td>Lovande men fler studier behövs</td></tr>
      <tr><td>Påstående 3</td><td><span class="score">Svag</span></td><td>Otillräckligt underlag</td></tr>
    </table>

    <h2>Vilka begränsningar finns?</h2>
    <p>Vilka begränsningar finns? Vad vet vi inte ännu? Vilka studier saknas?</p>

    <h2>Vad kan man ta med sig?</h2>
    <p>Konkreta, evidensbaserade rekommendationer:</p>
    <ul>
      <li>Rekommendation 1 baserad på forskningen</li>
      <li>Rekommendation 2</li>
      <li>Rekommendation 3</li>
    </ul>

    <p><em>Läs även: <a href="#">Relaterad artikel på bloggen</a></em></p>

    <div class="cta-box">
      <p><strong>Vill du prova själv?</strong></p>
      <a href="#">Se vårt test →</a>
    </div>

    <h2>Vanliga frågor</h2>
    <div class="faq-item">
      <h3>Fråga 1?</h3>
      <p>Svar på fråga 1.</p>
    </div>
    <div class="faq-item">
      <h3>Fråga 2?</h3>
      <p>Svar på fråga 2.</p>
    </div>

    <h2>Källor</h2>
    <ol>
      <li><a href="#">[Författare et al.]</a> "[Studietitel]", <em>[Tidskrift]</em>, [År].</li>
      <li><a href="#">[Författare et al.]</a> "[Studietitel]", <em>[Tidskrift]</em>, [År].</li>
      <li><a href="#">[Författare et al.]</a> "[Studietitel]", <em>[Tidskrift]</em>, [År].</li>
    </ol>
  </div>
</body>
</html>`,
  },

  {
    id: "testimonial",
    name: "Resultat & upplevelser",
    description: "Before/after story with timeline — high trust, perfect for collagen/supplement results",
    category: "Upplevelser",
    getHtml: (name) => `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)}</title>
  ${sharedStyles}
</head>
<body>
  <div class="article">
    <h1>${esc(name)}</h1>
    <p class="intro">En ärlig genomgång av resultat och upplevelser — vecka för vecka. Vad kan man realistiskt förvänta sig, och vad säger forskningen?</p>

    <div class="tldr">
      <strong>Kort sammanfattning (TL;DR)</strong>
      <p>Första skillnaden märks efter [X veckor]: [effekt 1]. Efter [Y veckor]: [effekt 2]. Enligt <a href="#">kliniska studier</a> behöver man minst [Z veckor] för att se tydliga resultat.</p>
    </div>

    <img class="hero-img" src="https://placehold.co/1200x675/f5f3ff/a78bfa?text=Resultat" alt="Resultat och upplevelser">

    <h2>Varför testade vi detta?</h2>
    <p>Bakgrunden till testet. Vad var utgångspunkten? Beskriv problemet eller behovet som startade resan. Enligt <a href="#">en studie publicerad i [tidskrift]</a> är detta ett vanligt problem bland [målgrupp].</p>

    <h2>Vad sa forskningen innan vi började?</h2>
    <p>Sammanfatta relevant forskning. Vilka resultat har kliniska studier visat? Var realistisk — citera faktiska studier och ange doser/tidsramar. Exempelvis visade <a href="#">Proksch et al. (2014)</a> att [effekt] efter [X veckor] med [dos].</p>

    <div class="info-box">
      <strong>Viktigt att veta:</strong> Individuella resultat varierar. Det vi beskriver här är en personlig upplevelse — inte ett medicinskt löfte. Kontakta alltid din läkare vid hälsofrågor.
    </div>

    <h2>Hur såg resan ut vecka för vecka?</h2>

    <div class="timeline">
      <div class="timeline-entry">
        <h3>Vecka 1–2: Start</h3>
        <p>Beskriv de första intrycken. Hur kändes det? Var det någon skillnad alls? Smak, konsistens, rutin — allt som är relevant för läsaren.</p>
      </div>
      <div class="timeline-entry">
        <h3>Vecka 3–4: Första förändringarna</h3>
        <p>Beskriv de första märkbara skillnaderna. Var specifik — vad förändrades och hur märkte man det?</p>
      </div>
      <div class="timeline-entry">
        <h3>Vecka 5–8: Tydliga resultat</h3>
        <p>Beskriv hur resultaten utvecklades. Vilka förändringar blev tydliga? Stämmer detta överens med vad forskningen förutspådde?</p>
      </div>
      <div class="timeline-entry">
        <h3>Vecka 9–12: Långtidseffekt</h3>
        <p>Beskriv resultat efter längre tid. Fortsatte förbättringen? Planade den ut? Vad blev slutresultatet?</p>
      </div>
    </div>

    <h2>Före och efter — vad förändrades egentligen?</h2>

    <div class="before-after">
      <div class="before">
        <div class="label">Före</div>
        <img src="https://placehold.co/560x400/f3f4f6/9ca3af?text=Före" alt="Före behandling">
      </div>
      <div class="after">
        <div class="label">Efter</div>
        <img src="https://placehold.co/560x400/f0fdf4/059669?text=Efter" alt="Efter behandling">
      </div>
    </div>

    <div class="results-box">
      <h3>Sammanfattning av resultat</h3>
      <ul>
        <li><strong>Effekt 1:</strong> Beskriv den tydligaste förändringen</li>
        <li><strong>Effekt 2:</strong> Beskriv den näst tydligaste</li>
        <li><strong>Effekt 3:</strong> Eventuell bonus-effekt</li>
        <li><strong>Tid till resultat:</strong> X veckor</li>
      </ul>
    </div>

    <h2>Vad tyckte andra som testat?</h2>

    <div class="quote-block">
      <p>"Citat från en person som testat. Beskriv upplevelsen med egna ord — autentiskt och specifikt."</p>
      <div class="attribution">— Namn, ålder, stad</div>
    </div>

    <div class="quote-block">
      <p>"Ytterligare ett citat. Visa variation — inte alla behöver vara överdrivet positiva. Ärlighet bygger förtroende."</p>
      <div class="attribution">— Namn, ålder, stad</div>
    </div>

    <p><em>Läs även: <a href="#">Relaterad artikel på bloggen</a></em></p>

    <h2>Vad är vår slutsats?</h2>
    <p>Sammanfatta den ärliga bedömningen. Vem passar detta för? Vem bör eventuellt välja något annat? Var realistisk med förväntningar.</p>

    <div class="cta-box">
      <p><strong>Vill du prova själv?</strong></p>
      <a href="#">Läs mer om produkten</a>
    </div>

    <h2>Vanliga frågor</h2>
    <div class="faq-item">
      <h3>Hur lång tid tar det innan man ser resultat?</h3>
      <p>Svar baserat på forskning och upplevelser.</p>
    </div>
    <div class="faq-item">
      <h3>Finns det några biverkningar?</h3>
      <p>Svar — var ärlig och citera relevanta studier.</p>
    </div>
    <div class="faq-item">
      <h3>Hur länge behöver man fortsätta?</h3>
      <p>Svar.</p>
    </div>
  </div>
</body>
</html>`,
  },
];

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
