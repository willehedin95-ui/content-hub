# Generator for expertpanelen.se/kollagen-bast-i-test
# usage: python3 build.py  -> writes kollagen-bast-i-test.html next to this file
# Data: products.json (list, ordered by rank) + site.json (panel, dates, faq, sources)
import json, html, os, re
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
P = json.load(open(os.path.join(HERE, "products.json")))
S = json.load(open(os.path.join(HERE, "site.json")))

CRITERIA = S["criteria"]  # [{key, label, weight, what}]
def esc(t): return html.escape(str(t), quote=True)

def total_score(p):
    s = sum(p["scores"][c["key"]] * c["weight"] for c in CRITERIA) / 100.0
    return round(s, 1)

for p in P:
    p["total"] = total_score(p)
P_sorted = sorted(P, key=lambda p: -p["total"])
assert [p["slug"] for p in P] == [p["slug"] for p in P_sorted], "products.json order must match computed totals: " + str([(p['slug'], p['total']) for p in P_sorted])

def score_class(v):
    return "good" if v >= 8.0 else ("mid" if v >= 7.0 else "low")

def fmt_kr(v):
    return f"{v:,.0f}".replace(",", " ") + " kr"

def fmt_dec(v):
    return f"{v:.1f}".replace(".", ",")

def kr_per_day(p):
    return f"{p['price_per_day']:.2f}".replace(".", ",") + " kr"

def mg_fmt(v):
    return f"{v:,.0f}".replace(",", " ") + " mg"

def anchor(p): return f"produkt-{p['slug']}"

# ---------- pieces ----------
def topplista_rows(products):
    out = []
    for i, p in enumerate(products, 1):
        out.append(f'''
      <li class="top-row{' is-winner' if i==1 else ''}">
        <span class="top-rank {score_class(p['total'])}">{i}</span>
        <a class="top-thumb" href="#{anchor(p)}"><img src="{esc(p['image'])}" alt="{esc(p['name'])}" loading="{'eager' if i<=3 else 'lazy'}" width="72" height="72"></a>
        <div class="top-main">
          <span class="pill pill-role">{esc(p['role'])}</span>
          <a class="top-name" href="#{anchor(p)}">{esc(p['name'])}</a>
          <span class="top-meta">{esc(p['form'])} · {mg_fmt(p['collagen_mg'])}/dag · {kr_per_day(p)}/dag</span>
        </div>
        <span class="top-score {score_class(p['total'])}">{fmt_dec(p['total'])}<small>/10</small></span>
        <span class="top-price">{fmt_kr(p['price'])}</span>
        <a class="btn btn-primary" href="{esc(p['buy_url'])}" target="_blank" rel="{'noopener' if p.get('own') else 'nofollow noopener'}">Till butik</a>
      </li>''')
    return "\n".join(out)

def compare_table(products):
    WIN = ' class="is-winner"'
    head = "".join(f'<th scope="col"{WIN if i==0 else ""}><img src="{esc(p["image"])}" alt="" width="56" height="56" loading="lazy"><span>{esc(p["short"])}</span></th>' for i,p in enumerate(products))
    rows = [
        ("Betyg", lambda p: f'<span class="score-chip {score_class(p["total"])}">{fmt_dec(p["total"])}</span>'),
        ("Form", lambda p: esc(p["form"])),
        ("Kollagen per dagsdos", lambda p: mg_fmt(p["collagen_mg"])),
        ("Typ", lambda p: esc(p["collagen_type"])),
        ("Källa", lambda p: esc(p["source"])),
        ("Tillverkad i", lambda p: esc(p["made_in"])),
        ("Vitamin C", lambda p: "✓" if p["vitamin_c"] else "–"),
        ("Hyaluronsyra", lambda p: "✓" if p["hyaluronic"] else "–"),
        ("Biotin / zink", lambda p: "✓" if p["biotin_zinc"] else "–"),
        ("Sockerfri", lambda p: "✓" if p["sugar_free"] else "–"),
        ("Pris", lambda p: fmt_kr(p["price"])),
        ("Dagar per förpackning", lambda p: str(p["days"])),
        ("Pris per dag", lambda p: kr_per_day(p)),
        ("mg kollagen per krona", lambda p: f'{p["mg_per_kr"]:,.0f}'.replace(",", " ")),
    ]
    body = "".join(f'<tr><th scope="row">{esc(label)}</th>' + "".join(f'<td{WIN if i==0 else ""}>{fn(p)}</td>' for i,p in enumerate(products)) + "</tr>" for label, fn in rows)
    return f'<div class="table-wrap" tabindex="0"><table class="compare"><thead><tr><th scope="col"></th>{head}</tr></thead><tbody>{body}</tbody></table></div>'

def score_bars(p):
    out = []
    for c in CRITERIA:
        v = p["scores"][c["key"]]
        out.append(f'<li><span class="bar-label">{esc(c["label"])} <em>{c["weight"]}%</em></span><span class="bar"><span class="bar-fill {score_class(v)}" style="width:{v*10}%"></span></span><span class="bar-val">{fmt_dec(v)}</span></li>')
    return "<ul class=\"bars\">" + "".join(out) + "</ul>"

def product_card(p, i):
    pros = "".join(f"<li>{esc(x)}</li>" for x in p["pros"])
    cons = "".join(f"<li>{esc(x)}</li>" for x in p["cons"])
    faq = "".join(f'<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>' for q, a in p["faq"])
    specs = [
        ("Kollagen per dos", mg_fmt(p["collagen_mg"])),
        ("Typ och källa", f'{p["collagen_type"]}, {p["source"]}'),
        ("Form", p["form"]),
        ("Daglig dos", p["dose_desc"]),
        ("Dagar per förpackning", str(p["days"])),
        ("Övriga aktiva", p["actives"]),
        ("Sötning", p["sweetening"]),
        ("Tillverkad i", p["made_in"]),
        ("Pris", f'{fmt_kr(p["price"])} ({kr_per_day(p)} per dag)'),
    ]
    spec_html = "".join(f"<div><dt>{esc(k)}</dt><dd>{esc(v)}</dd></div>" for k, v in specs)
    rel = 'noopener' if p.get('own') else 'nofollow noopener'
    return f'''
    <article class="card{' card-winner' if i==1 else ''}" id="{anchor(p)}">
      <header class="card-head">
        <span class="card-rank {score_class(p['total'])}">{i}</span>
        <div class="card-title">
          <span class="pill pill-role">{esc(p['role'])}</span>
          <h3>{esc(p['name'])}</h3>
          <p class="card-tagline">{esc(p['tagline'])}</p>
        </div>
        <div class="card-scorebox"><span class="card-score {score_class(p['total'])}">{fmt_dec(p['total'])}</span><small>av 10</small></div>
      </header>
      <div class="card-body">
        <figure class="card-figure"><img src="{esc(p['image'])}" alt="{esc(p['name'])}" width="420" height="420" loading="{'eager' if i==1 else 'lazy'}"><figcaption>{esc(p.get('image_caption',''))}</figcaption></figure>
        <div class="card-copy">
          <p class="card-summary">{esc(p['summary'])}</p>
          {score_bars(p)}
          <div class="card-buy">
            <div class="card-buy-text"><strong>{fmt_kr(p['price'])}</strong> <span>hos {esc(p['store'])}</span><small>{kr_per_day(p)} per dag · {esc(p['store_note'])}</small></div>
            <a class="btn btn-primary" href="{esc(p['buy_url'])}" target="_blank" rel="{rel}">Till butik</a>
          </div>
        </div>
      </div>
      <div class="proscons">
        <div class="pros"><h4>Fördelar</h4><ul>{pros}</ul></div>
        <div class="cons"><h4>Nackdelar</h4><ul>{cons}</ul></div>
      </div>
      <div class="card-text">{p['review_html']}</div>
      <dl class="specs">{spec_html}</dl>
      <div class="fit"><h4>Vem passar den för?</h4><p>{esc(p['fit'])}</p></div>
      <div class="card-faq">{faq}</div>
    </article>'''

def method_matrix():
    rows = "".join(f'<tr><th scope="row">{esc(c["label"])}</th><td>{c["weight"]}%</td><td>{esc(c["what"])}</td><td>{esc(c["source"])}</td></tr>' for c in CRITERIA)
    return f'<div class="table-wrap" tabindex="0"><table class="matrix"><thead><tr><th>Kriterium</th><th>Vikt</th><th>Vad vi mäter</th><th>Källa</th></tr></thead><tbody>{rows}</tbody></table></div>'

def faq_section():
    return "".join(f'<details class="faq-item"><summary>{esc(q)}</summary><div>{a}</div></details>' for q, a in S["faq"])

def sources():
    return "".join(f'<li id="kalla-{i}"><a href="{esc(u)}" target="_blank" rel="noopener">{esc(t)}</a></li>' for i,(t,u) in enumerate(S["sources"],1))

def absurl(u):
    return S["base_url"] + u if u.startswith("/") else u

def json_ld(products):
    base = S["base_url"]; url = base + S["path"]
    win = products[0]
    items = []
    for i, p in enumerate(products, 1):
        items.append({
            "@type": "ListItem", "position": i,
            "item": {
                "@type": "Product", "name": p["name"], "image": p["image"], "brand": {"@type": "Brand", "name": p["brand"]},
                "offers": {"@type": "Offer", "priceCurrency": "SEK", "price": p["price"], "url": p["buy_url"], "availability": "https://schema.org/InStock"},
                "review": {"@type": "Review", "author": {"@type": "Person", "name": S["author"]["name"]},
                            "reviewRating": {"@type": "Rating", "ratingValue": p["total"], "bestRating": 10, "worstRating": 1},
                            "positiveNotes": {"@type": "ItemList", "itemListElement": [{"@type": "ListItem", "position": j+1, "name": x} for j, x in enumerate(p["pros"][:4])]},
                            "negativeNotes": {"@type": "ItemList", "itemListElement": [{"@type": "ListItem", "position": j+1, "name": x} for j, x in enumerate(p["cons"][:3])]}}
            }})
    graph = [
        {"@type": "Organization", "@id": base + "/#org", "name": "Expertpanelen", "url": base + "/", "logo": base + "/logo.svg"},
        {"@type": "WebSite", "@id": base + "/#site", "url": base + "/", "name": "Expertpanelen", "publisher": {"@id": base + "/#org"}, "inLanguage": "sv-SE"},
        {"@type": "Person", "@id": base + "/redaktion/#" + S["author"]["slug"], "name": S["author"]["name"], "jobTitle": S["author"]["title"], "image": absurl(S["author"]["image"]), "worksFor": {"@id": base + "/#org"}},
        {"@type": "Person", "@id": base + "/redaktion/#" + S["reviewer"]["slug"], "name": S["reviewer"]["name"], "jobTitle": S["reviewer"]["title"], "image": absurl(S["reviewer"]["image"]), "worksFor": {"@id": base + "/#org"}},
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Hem", "item": base + "/"},
            {"@type": "ListItem", "position": 2, "name": "Bäst i test", "item": base + "/bast-i-test/"},
            {"@type": "ListItem", "position": 3, "name": S["h1"], "item": url}]},
        {"@type": "Article", "@id": url + "#article", "headline": S["title"], "description": S["meta_description"], "url": url, "mainEntityOfPage": url,
         "datePublished": S["published"], "dateModified": S["updated"], "inLanguage": "sv-SE",
         "author": {"@id": base + "/redaktion/#" + S["author"]["slug"]}, "editor": {"@id": base + "/redaktion/#" + S["reviewer"]["slug"]},
         "publisher": {"@id": base + "/#org"}, "image": win["image"],
         "about": {"@type": "Thing", "name": "Kollagentillskott"}},
        {"@type": "ItemList", "@id": url + "#list", "name": S["h1"], "numberOfItems": len(products), "itemListOrder": "https://schema.org/ItemListOrderDescending", "itemListElement": items},
        {"@type": "FAQPage", "@id": url + "#faq", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": re.sub(r"<[^>]+>", " ", a).strip()}} for q, a in S["faq"]]},
    ]
    return json.dumps({"@context": "https://schema.org", "@graph": graph}, ensure_ascii=False)

# ---------- page ----------
def build():
    products = P
    LOGO = S.get("logo_html") or "Expert<span>panelen</span>"
    win = products[0]
    css = open(os.path.join(HERE, "style.css")).read()
    toc = [("topplista", "Topplistan"), ("jamforelse", "Jämförelsetabell"), ("produkter", "Alla produkter i testet"), ("metod", "Så testade vi"), ("guide", "Så väljer du kollagen"), ("faq", "Vanliga frågor"), ("kallor", "Källor")]
    toc_html = "".join(f'<li><a href="#{a}">{esc(t)}</a></li>' for a, t in toc)
    top3 = products[:3]
    page = f'''<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(S["title"])}</title>
<meta name="description" content="{esc(S["meta_description"])}">
<link rel="canonical" href="{esc(S["base_url"] + S["path"])}">
<meta property="og:type" content="article">
<meta property="og:title" content="{esc(S["title"])}">
<meta property="og:description" content="{esc(S["meta_description"])}">
<meta property="og:image" content="{esc(win["image"])}">
<meta property="og:url" content="{esc(S["base_url"] + S["path"])}">
<meta property="og:locale" content="sv_SE">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#153f3b">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>{css}</style>
<script type="application/ld+json">{json_ld(products)}</script>
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
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-top">
      <nav class="crumbs" aria-label="Brödsmulor"><a href="/">Hem</a> › <a href="/bast-i-test/">Bäst i test</a> › <span>Kollagen</span></nav>
      <span class="pill pill-cat">Bäst i test · Kollagen</span>
      <h1>{esc(S["h1"])}</h1>
    </div>
    <aside class="winner-card" aria-label="Testvinnare">
      <span class="winner-label">Testvinnare 2026</span>
      <img src="{esc(win["image"])}" alt="{esc(win["name"])}" width="220" height="220">
      <h2>{esc(win["name"])}</h2>
      <p>{esc(win["tagline"])}</p>
      <div class="winner-row"><span class="score-chip good big">{fmt_dec(win["total"])}<small>/10</small></span><span class="winner-price">{fmt_kr(win["price"])}<small>{kr_per_day(win)} per dag</small></span></div>
      <a class="btn btn-primary btn-block" href="{esc(win["buy_url"])}" target="_blank" rel="noopener">Till butik</a>
      <a class="btn btn-ghost btn-block" href="#{anchor(win)}">Läs hela omdömet</a>
    </aside>
    <div class="hero-rest">
      <p class="lead">{S["lead_html"]}</p>
      <div class="byline">
        <img src="{esc(S["author"]["image"])}" alt="" width="44" height="44">
        <div>
          <span>Skriven av <a href="/redaktion/#{esc(S["author"]["slug"])}">{esc(S["author"]["name"])}</a>, {esc(S["author"]["title"])}</span>
          <span>Granskad av <a href="/redaktion/#{esc(S["reviewer"]["slug"])}">{esc(S["reviewer"]["name"])}</a>, {esc(S["reviewer"]["title"])}</span>
          <span>Publicerad {esc(S["published_h"])} · Uppdaterad {esc(S["updated_h"])}</span>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="wrap answer" id="svar">
  <h2>Vilket kollagen är bäst i test 2026?</h2>
  <p>{S["answer_html"]}</p>
</section>

<section class="wrap" id="topplista">
  <div class="section-head"><h2>Topplistan: {len(products)} kollagentillskott, rangordnade</h2><p>Betyget är ett viktat medel av sex kriterier, se <a href="#metod">metoden</a>. Klicka på namnet för hela omdömet.</p></div>
  <ol class="toplist">{topplista_rows(products)}</ol>
</section>

<nav class="wrap toc" aria-label="Innehåll"><strong>Innehåll</strong><ol>{toc_html}</ol></nav>

<section class="wrap" id="jamforelse">
  <div class="section-head"><h2>Jämförelsetabell</h2><p>Alla värden är hämtade från produkternas egna etiketter och butikssidor {esc(S["updated_h"])}. Priset per dag räknas på ordinarie pris och antalet dagsdoser i förpackningen.</p></div>
  {compare_table(products)}
</section>

<section class="wrap" id="produkter">
  <div class="section-head"><h2>Alla produkter i testet</h2><p>Samma mall för alla: betyg per kriterium, fördelar och nackdelar, specifikation, vem den passar.</p></div>
  {"".join(product_card(p, i) for i, p in enumerate(products, 1))}
</section>

<section class="wrap method" id="metod">
  <div class="section-head"><h2>Så testade vi</h2></div>
  <div class="method-stats">
    <div><strong>{S["method"]["screened"]}</strong><span>produkter kartlagda</span></div>
    <div><strong>{len(products)}</strong><span>produkter i testet</span></div>
    <div><strong>{len(CRITERIA)}</strong><span>viktade kriterier</span></div>
  </div>
  {S["method"]["intro_html"]}
  <h3>Betygsmatrisen</h3>
  {method_matrix()}
  <p>{S["method"]["scoring_html"]}</p>
  <h3>Urval</h3>
  {S["method"]["selection_html"]}
  <h3>Vad vi inte gör</h3>
  {S["method"]["limits_html"]}
  <h3>Så håller vi testet aktuellt</h3>
  {S["method"]["update_html"]}
</section>

<section class="wrap guide" id="guide">
  <div class="section-head"><h2>Så väljer du kollagen</h2></div>
  {S["guide_html"]}
</section>

<section class="wrap faq" id="faq">
  <div class="section-head"><h2>Vanliga frågor om kollagen</h2></div>
  {faq_section()}
</section>

<section class="wrap sources" id="kallor">
  <h2>Källor</h2>
  <ol>{sources()}</ol>
</section>
</main>

<div class="sticky-bar" id="sticky" aria-hidden="true">
  <div class="wrap sticky-inner">
    <img src="{esc(win["image"])}" alt="" width="44" height="44">
    <div class="sticky-text"><span class="pill pill-win">Bäst i test</span><strong>{esc(win["name"])}</strong><span>{fmt_dec(win["total"])}/10 · {fmt_kr(win["price"])}</span></div>
    <a class="btn btn-primary" href="{esc(win["buy_url"])}" target="_blank" rel="noopener">Till butik</a>
    <a class="btn btn-ghost" href="#{anchor(win)}">Omdömet</a>
  </div>
</div>

<footer class="site-foot" id="sidfot">
  <div class="wrap foot-grid">
    <div>
      <a class="logo logo-foot" href="/">Expert<span>panelen</span></a>
      <p>Öppen metod, samma mall för alla produkter. Vi jämför produkter som säljs i Sverige och skriver ut både plus och minus.</p>
    </div>
    <div>
      <h4>Om sidan</h4>
      <ul><li><a href="/sa-testar-vi/">Så testar vi</a></li><li><a href="/redaktion/">Redaktionen</a></li><li><a href="/rattelser/">Rättelser</a></li><li><a href="/kontakt/">Kontakt</a></li></ul>
    </div>
    <div class="foot-legal">
      <h4>Reklaminformation</h4>
      <p>{S["footer_disclaimer_html"]}</p>
      <p>© {date.today().year} Expertpanelen · {esc(S["company_line"])}</p>
    </div>
  </div>
</footer>

<script>
(function(){{
  var bar=document.getElementById('sticky'),hero=document.querySelector('.winner-card'),cards=document.getElementById('produkter');
  if(!bar||!hero)return;
  function tick(){{var r=hero.getBoundingClientRect();var show=r.bottom<0;bar.classList.toggle('is-visible',show);bar.setAttribute('aria-hidden',show?'false':'true');}}
  window.addEventListener('scroll',tick,{{passive:true}});tick();
  var t=document.querySelector('.nav-toggle'),n=document.getElementById('sitenav');
  if(t&&n){{t.addEventListener('click',function(){{var o=n.classList.toggle('is-open');t.setAttribute('aria-expanded',o?'true':'false');document.body.classList.toggle('nav-open',o);}});}}
  document.querySelectorAll('.table-wrap').forEach(function(w){{function u(){{w.classList.toggle('can-scroll',w.scrollWidth>w.clientWidth+4);}}u();window.addEventListener('resize',u);}});
}})();
</script>
</body>
</html>'''
    out = os.path.join(HERE, "kollagen-bast-i-test.html")
    open(out, "w").write(page)
    print("wrote", out, len(page.encode()), "bytes; totals:", [(p["slug"], p["total"]) for p in products])

if __name__ == "__main__":
    build()
