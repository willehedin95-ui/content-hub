# -*- coding: utf-8 -*-
"""Bygger Klaviyo-mallarna for progressbildsflodet.

Tva utfall per mall:
  *.klaviyo.html  - med Klaviyo-taggar, det som laddas upp
  *.preview.html  - med riktiga bilder, det William tittar pa

Mailsaker HTML: tabeller, inline CSS, 600 px, inga externa fonter, inga
bakgrundsbilder. Palett = Envanas tokens, samma som formularet.
"""
import io, os, sys

OUT = sys.argv[1]
MODE = sys.argv[2]  # "klaviyo" | "preview"
# Vilket lage forhandsvisningen ska visa. I klaviyo-lage styr villkoren i
# mallen och det har argumentet ignoreras.
VARIANT = sys.argv[3] if len(sys.argv) > 3 else "1"

BRAND, BG, SURFACE, HEAD, MUTED = "#f0573d", "#fefaf8", "#ffffff", "#320d01", "#7e6458"

# Dit knapparna gar. Formularet ligger pa hubben tills Shopify-sidan
# /pages/resa finns; byt BARA den har raden nar den gor det.
#
# `t` ar kundens signerade token, som eventet bar med sig. Den ar det som later
# formularet veta vem hon ar: hoppa over e-poststeget och visa hennes FORRA
# bild bredvid uppladdningen. Utan den blir dag 30 en upprepning av dag 0.
FORM_BAS = "https://content-hub-nine-theta.vercel.app/f/hydro13/progressbild"
SAMTYCKE_BAS = "https://content-hub-nine-theta.vercel.app/f/hydro13/samtycke"

def lank(bas, steg=None):
    if MODE == "preview":
        return "#forhandsvisning"
    q = "?t={{ event.token|urlencode }}"
    if steg:
        q += "&steg=" + steg
    return bas + q
FONT = "'Hanken Grotesk',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
# Rubrikfonten har bara vikt 400 och 500, sa H-stilen nedan far 500 och inte 700.
FONT_H = "'Bagoss Standard',Georgia,'Times New Roman',serif"

def img(slot, alt):
    """slot 1/2/3. I Klaviyo-lage en variabel, i preview en riktig fil."""
    if MODE == "klaviyo":
        return "{{ event.bild_%s_url }}" % slot
    return {"1": "dag1.jpg", "2": "dag30.jpg", "3": "dag60.jpg"}[slot]

def cond(expr, inner, els=""):
    """Klaviyo-villkor. I preview utvarderas de av byggaren i stallet."""
    if MODE == "klaviyo":
        out = "{%% if %s %%}%s" % (expr, inner)
        if els: out += "{%% else %%}%s" % els
        return out + "{% endif %}"
    return inner

def slot_cell(n, label, filled):
    """En ruta i serien, utan etikett - den ligger pa en egen tabellrad.

    Procentuell bredd, aldrig fasta pixlar. Tre bilder a 164 px tvingade den
    yttre tabellen till 624 px i en 390 px telefon, alltsa sidledsscroll i
    inkorgen. Uppmatt, inte antaget.
    """
    if filled:
        return (
          '<td width="33%%" align="center" valign="bottom" style="padding:0 5px;">'
          '<img src="%s" alt="%s" width="164" style="display:block;width:100%%;max-width:164px;'
          'height:auto;border-radius:10px;border:0;"></td>'
          % (img(str(n), label), label)
        )
    # Tomrutan ar en BILD med exakt samma proportion som kundens foton. En
    # CSS-ram med fast hojd kan inte folja med nar bredden ar procentuell, och
    # i mail finns ingen aspect-ratio att lita pa - resultatet blev en bild pa
    # 116 px bredvid tomrutor pa 150 px. Som bild krymper allt identiskt.
    src = "tom-ruta.png" if MODE == "preview" else "{{ organization.url }}/images/progressbild/tom-ruta.png"
    return (
      '<td width="33%%" align="center" valign="bottom" style="padding:0 5px;">'
      '<img src="%s" alt="Tom ruta, vantar pa din bild" width="164" '
      'style="display:block;width:100%%;max-width:164px;height:auto;border:0;"></td>' % src
    )

def label_cell(label, filled):
    return ('<td width="33%%" align="center" style="padding:7px 5px 0;">'
            '<span style="font:700 12px %s;letter-spacing:.6px;color:%s;">%s</span></td>'
            % (FONT, HEAD if filled else MUTED, label))

def par(fylld_slot, fylld_label, tom_label):
    """Tva rutor: hennes senaste bild och den hon ska ta nu. William
    2026-09-15: paminnelsen ska visa RUTORNA, inte bara selfien."""
    row1 = (slot_cell(fylld_slot, fylld_label, True).replace('width="33%%"', 'width="50%%"')
            + slot_cell(0, tom_label, False).replace('width="33%%"', 'width="50%%"'))
    row2 = (label_cell(fylld_label, True).replace('width="33%%"', 'width="50%%"')
            + label_cell(tom_label, False).replace('width="33%%"', 'width="50%%"'))
    return ('<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">'
            '<tr>' + row1 + '</tr><tr>' + row2 + '</tr></table>')

def serie_villkorad():
    """Tre rutor, var och en villkorad pa att BILDEN finns - aldrig pa ett antal.

    antal_bilder sa 3 efter tva milstolpar nar en uppladdning gjorts om, och en
    serie ritad efter ett ANTAL fyllde ruta 1 med tom URL nar kunden hoppat over
    ett steg, alltsa en trasig bildikon i mailet. Bara klaviyo-lage."""
    labels = ("DAG 1", "DAG 30", "DAG 60")
    row1 = "".join("{%% if event.bild_%d_url %%}%s{%% else %%}%s{%% endif %%}"
                   % (n, slot_cell(n, "", True), slot_cell(n, "", False)) for n in (1, 2, 3))
    row2 = "".join(label_cell(labels[n - 1], True) for n in (1, 2, 3))
    return ('<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">'
            '<tr>' + row1 + '</tr><tr>' + row2 + '</tr></table>')

def series(filled_count):
    labels = ("DAG 1", "DAG 30", "DAG 60")
    row1 = "".join(slot_cell(n, labels[n - 1], n <= filled_count) for n in (1, 2, 3))
    # Etiketterna pa en EGEN rad. Forut lag de under respektive ruta, och da
    # hamnade DAG 1 pa en annan hojd an DAG 30 sa fort bild och tomruta inte
    # var exakt lika hoga - vilket de aldrig ar nar bredden ar procentuell.
    row2 = "".join(label_cell(labels[n - 1], n <= filled_count) for n in (1, 2, 3))
    return ('<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">'
            '<tr>' + row1 + '</tr><tr>' + row2 + '</tr></table>')

def button(text, href="#"):
    return (
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">'
      '<tr><td align="center" bgcolor="%s" style="border-radius:12px;">'
      '<a href="%s" style="display:inline-block;padding:16px 34px;font:700 17px %s;'
      'color:#ffffff;text-decoration:none;border-radius:12px;">%s</a></td></tr></table>'
      % (BRAND, href, FONT, text)
    )

def gift(belopp="200"):
    """Presentkortet som BILD. Beloppet och wordmarken ar satta i kod ovanpa ett
    genererat kortunderlag (Higgsfield), inte genererade - en bildmodell far
    inte "200 kr" ratt, och ett fel belopp ar ett loftesfel.

    Tabellvarianten som stod har forut ritade kortet med CSS, vilket Outlook
    och Gmail renderade som en platt fyrkant utan radie."""
    fil = "presentkort-400-mail.jpg" if belopp == "400" else "presentkort-mail.jpg"
    src = fil if MODE == "preview" else "{{ organization.url }}/images/progressbild/" + fil
    return (
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%" align="center">'
      '<tr><td align="center">'
      '<img src="%s" width="290" alt="Presentkort pa %s kronor" '
      'style="display:block;width:100%%;max-width:290px;height:auto;border:0;">'
      '</td></tr></table>' % (src, belopp)
    )

CDN = "https://d3k81ch9hvuctc.cloudfront.net/company/W9uZu4/images/"

def footer_bild(fil, alt, href=None):
    img = ('<img src="%s%s" alt="%s" width="600" style="display:block;width:100%%;'
           'max-width:600px;height:auto;border:0;">' % (CDN, fil, alt))
    if href:
        return '<a href="%s" style="text-decoration:none;border:0;">%s</a>' % (href, img)
    return img

def envana_footer():
    """Butikens riktiga footer, inte en egen tolkning av den.

    Wordmarken, navigeringen och USP-raden ar BILDER i Envanas Klaviyo-konto,
    och samma URL:er aterbrukas har sa footern blir identisk med den kunden
    redan sett i uthamtningsmejlet. Tva fel fran originalet ar rattade: dar
    bar wordmarken alt="renew" och lankade till nedlagda get-renew.com.
    """
    rader = "".join(
        '<tr><td align="center" style="padding:0;">%s</td></tr>' % r for r in [
            footer_bild("ac4b2c18-1389-4097-a9ce-9e5ffc909e89.jpeg", "Envana", "https://shopenvana.com/"),
            footer_bild("85145ec1-4a15-46df-a07b-07e8b3399be6.jpeg", "Hem", "https://shopenvana.com/"),
            footer_bild("7df44d92-7761-4782-8b21-2141680f14bc.jpeg", "Vanliga frågor", "https://shopenvana.com/pages/faq"),
            footer_bild("07978449-c728-4570-bd1e-3b1b27bd448a.jpeg", "Kontakt", "https://shopenvana.com/pages/kontakt"),
            footer_bild("84249a4f-b4e2-4ed2-9cb8-e71c1771bb90.jpeg",
                        "1-3 dagars gratis leverans, tillverkad i Sverige, 60 dagar pengarna tillbaka garanti"),
        ])
    finstilt = (
      '<tr><td align="center" style="padding:16px 18px 26px;">'
      '<div style="font:400 12px %s;line-height:1.7;color:rgba(255,255,255,.72);">'
      'Du får det här mejlet för att du dokumenterar din Envana-resa.<br>'
      'Bilderna är dina. Vi visar dem aldrig för någon utan att fråga dig först.<br><br>'
      'Upphovsrätt &copy; {%% current_year %%}, {{ organization.name }}<br>'
      'Alla rättigheter förbehållna.<br>{{ organization.full_address }}<br><br>'
      'Om du vill avsluta prenumerationen, klicka på '
      '{%% unsubscribe \'Avsluta prenumeration\' %%}'
      '</div></td></tr>' % FONT)
    return (
      '<tr><td align="center" style="padding:26px 0 0;">%s</td></tr>'
      '<tr><td style="background:#330d02;padding:0;">'
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">'
      '%s%s</table></td></tr>'
      % (footer_bild("d6d7fc88-ee9b-43f4-b82e-e77f3543d923.png", ""), rader, finstilt))

def wordmark():
    fil = "envana-wordmark.png"
    src = fil if MODE == "preview" else "{{ organization.url }}/images/progressbild/" + fil
    return ('<img src="%s" alt="Envana" width="112" style="display:block;width:112px;'
            'max-width:112px;height:auto;border:0;">' % src)

def shell(preheader, body):
    return """<!doctype html>
<html lang="sv"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<style>
/* Envanas typsnitt dar klienten klarar webfonts (Apple Mail, iOS Mail).
   Gmail och Outlook struntar i @font-face, och DARFOR ar fallbacken en riktig
   systemstack och inte en notlosning - texten far aldrig hanga pa att fonten
   laddar. Wordmarken ar en BILD av samma skal. */
@font-face{font-family:'Bagoss Standard';font-style:normal;font-weight:400;font-display:swap;
  src:url(https://shopenvana.com/cdn/shop/t/3/assets/envana-font-bagossstandard-400.woff2) format('woff2')}
@font-face{font-family:'Hanken Grotesk';font-style:normal;font-weight:100 900;font-display:swap;
  src:url(https://shopenvana.com/cdn/shop/t/3/assets/envana-font-hankengrotesk-variable.woff2) format('woff2')}
</style></head>
<body style="margin:0;padding:0;background:%(bg)s;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">%(pre)s</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%" style="background:%(bg)s;">
<tr><td align="center" style="padding:28px 12px 40px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%%;max-width:600px;">
<tr><td align="center" style="padding:0 0 22px;">%(wordmark)s</td></tr>
<tr><td style="background:%(surface)s;border-radius:18px;padding:30px 26px;">%(body)s</td></tr>
%(footer)s
</table></td></tr></table></body></html>""" % dict(bg=BG, pre=preheader, font=FONT, head=HEAD, surface=SURFACE,
                                                  body=body, muted=MUTED, footer=envana_footer(), wordmark=wordmark())

H = ('style="font:500 25px %s;line-height:1.28;letter-spacing:-.02em;color:%s;'
     'margin:0 0 10px;"' % (FONT_H, HEAD))
P = 'style="font:400 16px %s;line-height:1.62;color:%s;margin:0 0 16px;"' % (FONT, MUTED)

# ---------------------------------------------------------------- 1. KVITTENS
# Togs bort tidigare samma dag for att den upprepade formularets sista skarm.
# Tillbaka 2026-09-16 med ett ANNAT jobb: den ar hennes ARKIV. Det finns ingen
# progressida byggd, sa mailet ar enda stallet dar hon kan se sina bilder nar
# hon sjalv vill - skarmen forsvinner nar hon stanger fliken.
#
# Darfor leder mailet med sparandet i stallet for med bekraftelsen. Det ar den
# raden som skiljer det fran skarmen hon nyss last.
if OUT.endswith("kvittens"):
    if MODE == "klaviyo":
        rubrik = ("{% if event.steg == '2' %}Halvvägs, en bild kvar"
                  "{% else %}Din första bild är sparad{% endif %}")
        serie = serie_villkorad()
    else:
        rubrik = "Halvvägs, en bild kvar" if VARIANT == "2" else "Din första bild är sparad"
        serie = series(2 if VARIANT == "2" else 1)
    body = ('<h1 %s>%s</h1>'
            '<p %s>Spara det här mejlet. Dina bilder ligger kvar här, så du kan '
            'öppna dem och se din resa när du vill.</p>%s'
            '<p style="font:400 14px %s;line-height:1.6;color:%s;margin:20px 0 0;text-align:center;">'
            'Rutorna fylls i takt med att du laddar upp.</p>'
            % (H, rubrik, P, serie, FONT, MUTED))
    html = shell("Dina bilder finns sparade här.", body)

# ------------------------------------------------------------- 2. PAMINNELSE
# Hennes FORRA bild visas stort. Det ar den enda vinkelguidning hon far, och
# den ar battre an en textrad: hon ser hur bilden togs i stallet for att lasa
# om det.
elif OUT.endswith("paminnelse"):
    if MODE == "klaviyo":
        rubrik = ("{% if event.antal_bilder == 2 %}Dags för din sista bild"
                  "{% else %}Dags för bild två{% endif %}")
        forra = cond("event.antal_bilder == 2",
                     serie_villkorad(),
                     par(1, "DAG 1", "DAG 30"))
    else:
        rubrik = "Dags för din sista bild" if VARIANT == "2" else "Dags för bild två"
        forra = series(2) if VARIANT == "2" else par(1, "DAG 1", "DAG 30")
    body = (
      '<h1 %s>%s</h1>'
      '<p %s>Så här ser din resa ut hittills. Ställ dig på samma plats, i samma ljus och håll '
      'telefonen lika högt, så blir jämförelsen rättvis.</p>'
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">'
      '<tr><td align="center" style="padding:4px 0 8px;">%s'
      '</td></tr></table>'
      '<div style="height:22px;"></div>%s'
      '<p style="font:400 14px %s;line-height:1.6;color:%s;margin:18px 0 0;text-align:center;">'
      'Tar 30 sekunder. Presentkortet på 200 kr kommer när alla tre är inne.</p>'
      % (H, rubrik, P, forra, button("Ta bilden", lank(FORM_BAS, "{% if event.antal_bilder == 2 %}3{% else %}2{% endif %}")), FONT, MUTED))
    html = shell("Det är dags för nästa progressbild.", body)

# ---------------------------------------------------------------- 3. SLUTMAIL
# Mailet stallde forut samtyckesfragan en gang till och lankade till det gamla
# samtyckesformularet - bada ersatta av svansen i formularet, dar hon redan
# svarat. Nu ar mailet en KVITTENS pa det hon valde, med ratt belopp.
#
# Och ramen ar bytt: dag 60 ar inte ett avslut. Kim et al. 2018 (Nutrients,
# DOI 10.3390/nu10070826, grad A2 i renew-study-registry) mater hudfukt vid
# vecka 6 och rynkor/elasticitet forst vid vecka 12. Dag 60 ar vecka 8,5,
# alltsa fore den andra matpunkten. Studien ar pa LMWCP och far inte
# framstallas som var produkts resultat - darav "i studier".
else:
    # Beloppet ar alltid 200. Samtyckesfragan med det dubblade presentkortet
    # ar borttagen ur flodet 2026-09-17 - se noten i seed-progressbild-form.ts.
    kort = gift("200")
    kvitto = "Presentkortet på <strong>200 kr</strong> mejlar vi till dig."
    body = (
      '<h1 %s>Här är dina tre bilder</h1>'
      '<p %s>Dag 1, dag 30 och dag 60, tagna av dig på dig.</p>'
      '%s'
      '<div style="height:26px;"></div>'
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">'
      '<tr><td style="border-top:1px solid #f1e5e0;padding:26px 0 0;">'
      '<h2 style="font:700 20px %s;line-height:1.35;color:%s;margin:0 0 10px;">'
      'Sextio dagar är en början, inte ett slut</h2>'
      '<p %s>I studier syns fukt tidigast runt vecka 6, och spänst och fina linjer '
      'först vid vecka 12. Du är inte framme vid den punkten än, så fortsätt med din '
      'dagliga shot.</p></td></tr></table>'
      '<div style="height:26px;"></div>'
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">'
      '<tr><td align="center" style="border-top:1px solid #f1e5e0;padding:26px 0 0;">%s'
      '<p style="font:400 15px %s;line-height:1.6;color:%s;margin:16px 0 0;">%s</p>'
      '</td></tr></table>'
      % (H, P, series(3), FONT, HEAD, P, kort, FONT, MUTED, kvitto))
    html = shell("Dina tre bilder, och ditt presentkort.", body)

io.open(OUT + "." + MODE + ".html", "w", encoding="utf-8").write(html)
print("skrev", OUT + "." + MODE + ".html", len(html), "tecken")
