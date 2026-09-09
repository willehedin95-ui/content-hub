# Variant B for A/B-testing: the original Envana/Halsobladet listicle
# (shopenvana.com/pages/kollagentest, Replo) re-hosted on expertpanelen.se with
# Expertpanelen's header, logo and footer. Content, styles, countdown and
# sticky bar are kept byte-for-byte apart from link rewrites.
# usage: python3 build_kollagentest.py  -> kollagentest.html
import re, json, os
from bs4 import BeautifulSoup
HERE = os.path.dirname(os.path.abspath(__file__))
GCLID = open(os.path.join(HERE, "gclid-tags.html")).read()  # Echelon/Viktor cross-domain GCLID scripts, verbatim
S = json.load(open(os.path.join(HERE, "site.json")))
src = open(os.path.join(HERE, "kollagentest-source.html")).read()
clone_css = open(os.path.join(HERE, "kollagentest-source.css")).read()
snippet_css = re.search(r'<style id="snippet-styles"[^>]*>([\s\S]*?)</style>', src).group(1)
soup = BeautifulSoup(src, "html.parser")
main = soup.find(id="replo-fullpage-element")  # html.parser nests the content under an unclosed <link>, so anchor on the Replo wrapper
root = main.find(attrs={"data-rid": "36edc7c7-804c-40e9-aa59-921791c59db5"})
root.find(attrs={"data-rid": "c1d2c4a9-30f0-46b8-8274-4c4f15cb85b8"}).decompose()   # fake Hälsobladet header
root.find(attrs={"data-rid": "1ac1302f-d2f4-422c-a79f-3f6cd67c6a3c"}).decompose()   # spacer under it
root.find(attrs={"data-rid": "78ec53dc-4693-4299-af6c-3f6cdb3989c6"}).decompose()   # Envana footer + reklaminfo
BUY = "https://shopenvana.com/products/collagen-formula?utm_source=expertpanelen&utm_medium=referral&utm_campaign=kollagentest"
for a in main.find_all("a", href=True):
    h = a["href"]
    if h.startswith("/products/collagen-formula"): a["href"] = BUY
    elif h.startswith("/pages/metod-kriterier"): a["href"] = "/sa-testar-vi/"
    elif h.startswith("/"): a["href"] = "https://shopenvana.com" + h
for tag in main.find_all(["img", "source"]):
    for attr in ("src", "srcset", "srcSet"):
        if tag.has_attr(attr) and tag[attr].startswith("//"): tag[attr] = "https:" + tag[attr]
# Dynamic "Uppdaterad" date: always yesterday, set client-side in Swedish.
date_box = root.find(attrs={"data-rid": "9b021bca-6b9d-444d-93a9-86dc52274aeb"})
date_div = date_box.find("div")
date_div["id"] = "ep-updated"
date_div.string = ""
content = str(main)
sticky = f'''<div id="esticky" class="esticky dold" aria-hidden="true">
  <a href="{BUY}" class="esticky__btn">Gå till testvinnaren</a>
</div>'''
scripts = re.findall(r'<script>\s*\(function \(\) \{\s*var (?:btn|h) = document[\s\S]*?</script>', src)
assert len(scripts) == 2, len(scripts)
scripts = [sc.replace("document.querySelector('a[href=\"/products/collagen-formula\"]')", "document.querySelector('a[href^=\"https://shopenvana.com/products/collagen-formula\"]')") for sc in scripts]
LOGO = S.get("logo_html") or "Expert<span>panelen</span>"
title = re.search(r"<title>(.*?)</title>", src).group(1)
desc = re.search(r'<meta name="description" content="([^"]*)"', src)
desc = desc.group(1) if desc else ""
shell_css = '''
:root{--ink:#1c1f1e;--muted:#5d6764;--line:#e3e6e4;--primary:#153f3b;--accent:#1d5fd6;--font:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.ep-head{background:#fff;border-bottom:1px solid var(--line);position:relative;z-index:5;font-family:var(--font)}
.ep-head .wrap{max-width:1120px;margin:0 auto;padding:0 20px;display:flex;align-items:center;justify-content:space-between;height:64px;box-sizing:border-box}
.ep-head .logo{display:block;text-decoration:none;font-weight:800;font-size:1.25rem;color:var(--primary)}
.ep-head .logo img{height:30px;width:auto;display:block}
.ep-nav{display:flex;gap:22px}
.ep-nav a{color:var(--ink);text-decoration:none;font-weight:500;font-size:.95rem}
.nav-toggle{display:none;width:44px;height:44px;border:0;background:none;padding:10px;cursor:pointer;flex-direction:column;justify-content:center;gap:5px}
.nav-toggle span{display:block;height:2px;background:var(--primary);border-radius:2px;transition:transform .2s,opacity .2s}
.nav-toggle[aria-expanded="true"] span:nth-child(1){transform:translateY(7px) rotate(45deg)}
.nav-toggle[aria-expanded="true"] span:nth-child(2){opacity:0}
.nav-toggle[aria-expanded="true"] span:nth-child(3){transform:translateY(-7px) rotate(-45deg)}
.ep-foot{background:var(--primary);color:#dfe7e5;padding:40px 0 30px;font-size:.9rem;font-family:var(--font);line-height:1.6}
.ep-foot .wrap{max-width:1120px;margin:0 auto;padding:0 20px;display:grid;grid-template-columns:1.2fr .8fr 1.6fr;gap:32px;box-sizing:border-box}
.ep-foot .logo{color:#fff;font-weight:800;font-size:1.25rem;text-decoration:none}
.ep-foot .logo span{color:#fff}
.ep-foot h4{color:#fff;margin:0 0 .4em;font-size:1rem}
.ep-foot p{margin:0 0 1em}
.ep-foot a{color:#fff}
.ep-foot ul{list-style:none;padding:0;margin:0}
.ep-foot li{margin-bottom:4px}
.ep-foot .legal p{font-size:.82rem;color:#c5d1ce}
@media (max-width:900px){.ep-foot .wrap{grid-template-columns:1fr}}
@media (max-width:640px){
  .nav-toggle{display:flex}
  .ep-nav{display:none;position:absolute;left:0;right:0;top:64px;background:#fff;border-bottom:1px solid var(--line);flex-direction:column;gap:0;padding:6px 0 10px;box-shadow:0 10px 24px rgba(20,40,38,.1)}
  .ep-nav.is-open{display:flex}
  .ep-nav a{padding:12px 20px;font-size:1.05rem;border-top:1px solid var(--line)}
}
'''
from datetime import date
page = f'''<!DOCTYPE html>
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
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{S["base_url"]}/kollagentest/">
<meta name="robots" content="noindex,follow">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#153f3b">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;700;800&display=swap" rel="stylesheet">
<style id="snippet-styles" type="text/css">{snippet_css}</style>
<style id="listicle-clone">{clone_css}</style>
<style id="ep-shell">{shell_css}</style>
</head>
<body>
<header class="ep-head">
  <div class="wrap">
    <a class="logo" href="/" aria-label="Expertpanelen">{LOGO}</a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="epnav" aria-label="Meny"><span></span><span></span><span></span></button>
    <nav class="ep-nav" id="epnav" aria-label="Huvudmeny">
      <a href="/bast-i-test/">Bäst i test</a>
      <a href="/sa-testar-vi/">Så testar vi</a>
      <a href="/redaktion/">Redaktionen</a>
    </nav>
  </div>
</header>
{content}
{sticky}
<footer class="ep-foot">
  <div class="wrap">
    <div>
      <a class="logo" href="/">Expert<span>panelen</span></a>
      <p>Öppen metod, samma mall för alla produkter.</p>
    </div>
    <div>
      <h4>Om sidan</h4>
      <ul><li><a href="/sa-testar-vi/">Så testar vi</a></li><li><a href="/redaktion/">Redaktionen</a></li><li><a href="/rattelser/">Rättelser</a></li><li><a href="/kontakt/">Kontakt</a></li></ul>
    </div>
    <div class="legal">
      <h4>Om betygen</h4>
      <p>{S["footer_disclaimer_html"].replace('#metod','/sa-testar-vi/')}</p>
      <p>© {date.today().year} Expertpanelen · {S["company_line"]}</p>
    </div>
  </div>
</footer>
{scripts[0]}
{scripts[1]}
<script>
(function(){{var e=document.getElementById('ep-updated');if(!e)return;var d=new Date();d.setDate(d.getDate()-1);var m=['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'];e.textContent=d.getDate()+' '+m[d.getMonth()]+' '+d.getFullYear();}})();
</script>
<script>
(function(){{var t=document.querySelector('.nav-toggle'),n=document.getElementById('epnav');if(t&&n){{t.addEventListener('click',function(){{var o=n.classList.toggle('is-open');t.setAttribute('aria-expanded',o?'true':'false');}});}}}})();
</script>
{GCLID}
</body>
</html>'''
open(os.path.join(HERE, "kollagentest.html"), "w").write(page)
print("wrote kollagentest.html", len(page.encode()), "bytes")
