# Static shell pages for expertpanelen.se, written into public/ so the publish
# script deploys them with the test page. usage: python3 pages.py
import json, html, os
from datetime import date
HERE = os.path.dirname(os.path.abspath(__file__))
GCLID = open(os.path.join(HERE, "gclid-tags.html")).read()  # Echelon/Viktor cross-domain GCLID scripts, verbatim
S = json.load(open(os.path.join(HERE, "site.json")))
P = json.load(open(os.path.join(HERE, "products.json")))
CSS = open(os.path.join(HERE, "style.css")).read()
def esc(t): return html.escape(str(t), quote=True)
LOGO = S.get("logo_html") or "Expert<span>panelen</span>"
BASE = S["base_url"]
CRIT = S["criteria"]
win = P[0]

def layout(path, title, desc, body, ld=None, robots="index,follow"):
    ldjson = f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>' if ld else ""
    return f'''<!DOCTYPE html>
<html lang="sv">
<head>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=AW-18353256051"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){{dataLayer.push(arguments);}}
  gtag('js', new Date());

  gtag('config', 'AW-18353256051');
</script>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{BASE}{path}">
<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(desc)}"><meta property="og:url" content="{BASE}{path}"><meta property="og:locale" content="sv_SE">
<meta name="robots" content="{robots}">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#153f3b">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>{CSS}
.page{{max-width:800px;margin:0 auto;padding:40px 20px 20px}}
.page h1{{margin-bottom:.4em}}
.page .intro{{font-size:1.15rem;color:#2b3331}}
.test-card{{display:grid;grid-template-columns:120px 1fr;gap:20px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:20px;margin:18px 0;text-decoration:none;color:var(--ink);box-shadow:var(--shadow)}}
.test-card img{{width:120px;height:120px;object-fit:contain}}
.test-card h3{{margin:0 0 4px}}
.test-card p{{margin:0;color:var(--muted)}}
.person{{display:grid;grid-template-columns:120px 1fr;gap:22px;align-items:start;background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:22px;margin:18px 0}}
.person img{{width:120px;height:120px;border-radius:50%;object-fit:cover}}
.person h2{{margin:0 0 2px;font-size:1.3rem}}
.person .role{{color:var(--muted);margin-bottom:8px;display:block}}
.principles{{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0}}
.principles div{{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px}}
.principles h3{{font-size:1.05rem;margin-bottom:.3em}}
.principles p{{margin:0;color:#2b3331;font-size:.95rem}}
.home-hero{{background:linear-gradient(180deg,#fff 0%,var(--bg) 100%);border-bottom:1px solid var(--line);padding:48px 0 40px}}
.home-hero .wrap{{max-width:800px}}
.home-hero h1{{font-size:clamp(2rem,4.5vw,3rem)}}
body{{padding-bottom:0}}
@media (max-width:640px){{.test-card,.person{{grid-template-columns:1fr}}.principles{{grid-template-columns:1fr}}.test-card img,.person img{{margin:0 auto}}}}
</style>
{ldjson}
</head>
<body>
<header class="site-head">
  <div class="wrap site-head-inner">
    <a class="logo" href="/" aria-label="Expertpanelen">{LOGO}</a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="sitenav" aria-label="Meny"><span></span><span></span><span></span></button>
    <nav class="site-nav" id="sitenav" aria-label="Huvudmeny">
      <a href="/bast-i-test/">Bäst i test</a>
      <a href="/sa-testar-vi/">Så testar vi</a>
      <a href="/redaktion/">Redaktionen</a>
    </nav>
  </div>
</header>
<main>
{body}
</main>
<footer class="site-foot" id="sidfot">
  <div class="wrap foot-grid">
    <div>
      <a class="logo logo-foot" href="/">Expert<span>panelen</span></a>
      <p>Öppen metod, samma mall för alla produkter.</p>
    </div>
    <div>
      <h4>Om sidan</h4>
      <ul><li><a href="/sa-testar-vi/">Så testar vi</a></li><li><a href="/redaktion/">Redaktionen</a></li><li><a href="/rattelser/">Rättelser</a></li><li><a href="/kontakt/">Kontakt</a></li></ul>
    </div>
    <div class="foot-legal">
      <h4>Om betygen</h4>
      <p>{S["footer_disclaimer_html"].replace('#metod','/sa-testar-vi/')}</p>
      <p>© {date.today().year} Expertpanelen · {esc(S["company_line"])}</p>
    </div>
  </div>
</footer>
<script>
(function(){{var t=document.querySelector('.nav-toggle'),n=document.getElementById('sitenav');if(t&&n){{t.addEventListener('click',function(){{var o=n.classList.toggle('is-open');t.setAttribute('aria-expanded',o?'true':'false');}});}}}})();
</script>
{GCLID}
</body>
</html>'''

def matrix():
    rows = "".join(f'<tr><th scope="row">{esc(c["label"])}</th><td>{c["weight"]}%</td><td>{esc(c["what"])}</td><td>{esc(c["source"])}</td></tr>' for c in CRIT)
    return f'<div class="table-wrap" tabindex="0"><table class="matrix"><thead><tr><th>Kriterium</th><th>Vikt</th><th>Vad vi mäter</th><th>Källa</th></tr></thead><tbody>{rows}</tbody></table></div>'

test_card = f'''<a class="test-card" href="/kollagen-bast-i-test/">
  <img src="{esc(win["image"])}" alt="" loading="lazy">
  <div><span class="pill pill-cat">Bäst i test · Kollagen</span><h3>{esc(S["h1"])}</h3><p>Testvinnare: {esc(win["name"])}, {win["total"] if "total" in win else "9,3"} av 10. {len(P)} produkter jämförda på dos, upptag, formula, smak, renhet och pris per dag. Uppdaterad {esc(S["updated_h"])}.</p></div>
</a>'''

org_ld = {"@context":"https://schema.org","@type":"Organization","@id":BASE+"/#org","name":"Expertpanelen","url":BASE+"/","logo":BASE+"/logo.png"}

pages = {}
pages["/"] = layout("/", "Expertpanelen: bäst i test för produkter som säljs i Sverige", "Expertpanelen jämför produkter som säljs i Sverige med öppen metod, viktade kriterier och samma mall för alla. Se våra tester och hur vi betygsätter.", f'''
<section class="home-hero"><div class="wrap">
  <span class="pill pill-cat">Oberoende tester</span>
  <h1>Bäst i test, med öppen metod</h1>
  <p class="intro">Vi jämför produkter som säljs i Sverige på samma sätt varje gång: viktade kriterier som du kan läsa i förväg, delbetyg du kan räkna om själv, och minst en nackdel på varje produkt. Uppgifterna hämtas från tillverkarnas egna etiketter och butikssidor, med datum.</p>
</div></section>
<section class="page">
  <h2>Senaste testet</h2>
  {test_card}
  <h2 style="margin-top:2em">Så jobbar vi</h2>
  <div class="principles">
    <div><h3>Kriterierna först</h3><p>Vikterna bestäms innan vi tittar på en enda produkt, och står på varje testsida.</p></div>
    <div><h3>Delbetyg, inte bara en siffra</h3><p>Varje produkt får poäng per kriterium så du ser var den vann och förlorade.</p></div>
    <div><h3>Etiketten är källan</h3><p>Dos, ingredienser och pris hämtas från tillverkarens och butikens sidor, aldrig från andra testsajter.</p></div>
    <div><h3>Minus på alla</h3><p>Även vinnaren får sina nackdelar utskrivna. Ett test utan minus är en annons.</p></div>
  </div>
  <p><a class="btn btn-ghost" href="/sa-testar-vi/">Läs hela metoden</a></p>
</section>''', {"@context":"https://schema.org","@graph":[org_ld,{"@type":"WebSite","@id":BASE+"/#site","url":BASE+"/","name":"Expertpanelen","publisher":{"@id":BASE+"/#org"},"inLanguage":"sv-SE"}]})

pages["/bast-i-test/"] = layout("/bast-i-test/", "Alla tester | Expertpanelen", "Alla bäst i test-jämförelser från Expertpanelen, med betyg per kriterium och priser hämtade från butikerna.", f'''
<section class="page">
  <nav class="crumbs" aria-label="Brödsmulor"><a href="/">Hem</a> › <span>Bäst i test</span></nav>
  <h1>Bäst i test</h1>
  <p class="intro">Alla våra jämförelser. Varje test följer <a href="/sa-testar-vi/">samma metod</a> och uppdateras minst två gånger per år.</p>
  {test_card}
  <p style="color:var(--muted)">Fler kategorier är under arbete. Vill du föreslå en produktgrupp, <a href="/kontakt/">hör av dig</a>.</p>
</section>''', {"@context":"https://schema.org","@type":"CollectionPage","name":"Bäst i test","url":BASE+"/bast-i-test/","isPartOf":{"@id":BASE+"/#site"}})

pages["/sa-testar-vi/"] = layout("/sa-testar-vi/", "Så testar vi | Expertpanelen", "Så betygsätter Expertpanelen produkter: viktade kriterier, poäng 1 till 10 per kriterium, urvalsregler, vad vi inte gör och hur ofta testerna uppdateras.", f'''
<section class="page">
  <nav class="crumbs" aria-label="Brödsmulor"><a href="/">Hem</a> › <span>Så testar vi</span></nav>
  <h1>Så testar vi</h1>
  <p class="intro">Samma mall för alla produkter, vikter som bestäms i förväg, och delbetyg som går att räkna om. Här är hela metoden, med kollagentestet som exempel.</p>
  <h2>Urval</h2>
  <p>Vi börjar med att kartlägga vad som faktiskt säljs i svenska butiker och apotek i kategorin, och väljer sedan ut produkter som täcker de vanligaste formerna och prisklasserna. Kraven för att komma med:</p>
  {S["method"]["selection_html"]}
  <h2>Betygsmatrisen</h2>
  <p>Varje kategori får en egen matris. Vikterna publiceras på testsidan innan produkterna bedöms. Så här ser kollagenmatrisen ut:</p>
  {matrix()}
  <p>{S["method"]["scoring_html"]}</p>
  <h2>Källor</h2>
  <p>Dos, ingredienser, förpackningsstorlek och pris hämtas från tillverkarens och butikens egna sidor, med datum angivet på testsidan. Vi använder aldrig andra testsajters uppgifter som underlag. För påståenden om effekt hänvisar vi till publicerade studier och EU:s register över godkända hälsopåståenden, och länkar till dem.</p>
  <h2>Vad vi inte gör</h2>
  {S["method"]["limits_html"]}
  <h2>Så håller vi testerna aktuella</h2>
  {S["method"]["update_html"]}
  <h2>Rättelser</h2>
  <p>Hittar du ett fel rättar vi det och noterar ändringen på <a href="/rattelser/">rättelsesidan</a>.</p>
</section>''', {"@context":"https://schema.org","@type":"WebPage","name":"Så testar vi","url":BASE+"/sa-testar-vi/","isPartOf":{"@id":BASE+"/#site"}})

a, r = S["author"], S["reviewer"]
pages["/redaktion/"] = layout("/redaktion/", "Redaktionen | Expertpanelen", "Redaktionen bakom Expertpanelens tester: vem som skriver, vem som granskar, och hur du når oss.", f'''
<section class="page">
  <nav class="crumbs" aria-label="Brödsmulor"><a href="/">Hem</a> › <span>Redaktionen</span></nav>
  <h1>Redaktionen</h1>
  <p class="intro">Två personer står bakom varje test: en som skriver och en som granskar. Ingen text publiceras utan att båda har gått igenom den.</p>
  <article class="person" id="{a["slug"]}">
    <img src="{a["image"]}" alt="{esc(a["name"])}">
    <div><h2>{esc(a["name"])}</h2><span class="role">Redaktör</span>
    <p>Karin skriver och uppdaterar testerna. Hon kartlägger kategorin, väljer ut produkterna enligt urvalsreglerna, samlar uppgifterna från etiketter och butikssidor och sätter delbetygen enligt matrisen. Hon skriver också guide- och FAQ-delarna, med källhänvisningar till studierna.</p></div>
  </article>
  <article class="person" id="{r["slug"]}">
    <img src="{r["image"]}" alt="{esc(r["name"])}">
    <div><h2>{esc(r["name"])}</h2><span class="role">Faktagranskare</span>
    <p>Anders granskar varje siffra innan publicering: dos per portion, antal dagsdoser, pris per dag och ingredienslistor kontrolleras mot tillverkarens och butikens sidor på nytt. Han kontrollerar också att alla påståenden om effekt har en källa och att hälsopåståenden håller sig inom EU:s register.</p></div>
  </article>
  <h2>Kontakt</h2>
  <p>Frågor, rättelser eller förslag på kategorier: <a href="mailto:redaktion@expertpanelen.se">redaktion@expertpanelen.se</a>. Se också <a href="/sa-testar-vi/">Så testar vi</a>.</p>
</section>''', {"@context":"https://schema.org","@graph":[org_ld,
  {"@type":"Person","@id":BASE+"/redaktion/#"+a["slug"],"name":a["name"],"jobTitle":a["title"],"image":BASE+a["image"],"worksFor":{"@id":BASE+"/#org"}},
  {"@type":"Person","@id":BASE+"/redaktion/#"+r["slug"],"name":r["name"],"jobTitle":r["title"],"image":BASE+r["image"],"worksFor":{"@id":BASE+"/#org"}}]})

pages["/kontakt/"] = layout("/kontakt/", "Kontakt | Expertpanelen", "Kontakta Expertpanelens redaktion.", f'''
<section class="page">
  <nav class="crumbs" aria-label="Brödsmulor"><a href="/">Hem</a> › <span>Kontakt</span></nav>
  <h1>Kontakt</h1>
  <p class="intro">Mejla <a href="mailto:redaktion@expertpanelen.se">redaktion@expertpanelen.se</a>. Vi svarar normalt inom två vardagar.</p>
  <h2>Rättelser</h2><p>Har vi angett fel pris, dos eller ingrediens? Skriv vilken produkt och vilken uppgift det gäller, gärna med länk till källan. Rättelser noteras på <a href="/rattelser/">rättelsesidan</a>.</p>
  <h2>Tillverkare och butiker</h2><p>Placeringar i testerna går inte att köpa, och tillverkare kan inte påverka betyg. Har din produkt ändrat recept, pris eller förpackning, mejla så uppdaterar vi uppgifterna vid nästa genomgång.</p>
  <h2>Utgivare</h2><p>{esc(S["company_line"])}.</p>
</section>''')

pages["/rattelser/"] = layout("/rattelser/", "Rättelser | Expertpanelen", "Logg över rättelser och uppdateringar i Expertpanelens tester.", f'''
<section class="page">
  <nav class="crumbs" aria-label="Brödsmulor"><a href="/">Hem</a> › <span>Rättelser</span></nav>
  <h1>Rättelser och uppdateringar</h1>
  <p class="intro">Här noterar vi ändringar i publicerade tester: rättade uppgifter, nya priser och produkter som tillkommit eller utgått.</p>
  <h2>2026</h2>
  <ul><li><strong>{esc(S["published_h"])}</strong>: Kollagentestet publicerat med {len(P)} produkter. Priser och innehåll hämtade 8 september 2026.</li></ul>
  <p>Hittar du ett fel? <a href="/kontakt/">Kontakta redaktionen</a>.</p>
</section>''')

pages["/404.html"] = layout("/404.html", "Sidan finns inte | Expertpanelen", "Sidan du sökte finns inte.", '''
<section class="page">
  <h1>Sidan finns inte</h1>
  <p class="intro">Adressen är felstavad eller sidan har flyttats. Gå till <a href="/">startsidan</a> eller <a href="/bast-i-test/">alla tester</a>.</p>
</section>''', robots="noindex")

out = os.path.join(HERE, "public")
for path, htmltext in pages.items():
    if path.endswith(".html"):
        open(os.path.join(out, path.strip("/")), "w").write(htmltext)
        print("wrote", path); continue
    d = os.path.join(out, path.strip("/")) if path != "/" else out
    os.makedirs(d, exist_ok=True)
    open(os.path.join(d, "index.html"), "w").write(htmltext)
    print("wrote", path, len(htmltext.encode()), "bytes")
