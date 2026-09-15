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
FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"

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

def gift(amount="200 kr", sub="Presentkort"):
    """Presentkortet som BILD. Beloppet och wordmarken ar satta i kod ovanpa ett
    genererat kortunderlag (Higgsfield), inte genererade - en bildmodell far
    inte "200 kr" ratt, och ett fel belopp ar ett loftesfel.

    Tabellvarianten som stod har forut ritade kortet med CSS, vilket Outlook
    och Gmail renderade som en platt fyrkant utan radie."""
    src = "presentkort-mail.jpg" if MODE == "preview" else "{{ organization.url }}/images/progressbild/presentkort-mail.jpg"
    return (
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%" align="center">'
      '<tr><td align="center">'
      '<img src="%s" width="290" alt="Presentkort pa 200 kronor" '
      'style="display:block;width:100%%;max-width:290px;height:auto;border:0;">'
      '</td></tr></table>' % src
    )

def shell(preheader, body):
    return """<!doctype html>
<html lang="sv"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting"></head>
<body style="margin:0;padding:0;background:%(bg)s;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">%(pre)s</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%" style="background:%(bg)s;">
<tr><td align="center" style="padding:28px 12px 40px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%%;max-width:600px;">
<tr><td align="center" style="padding:0 0 22px;">
<div style="font:700 13px %(font)s;letter-spacing:3.4px;color:%(head)s;">ENVANA</div></td></tr>
<tr><td style="background:%(surface)s;border-radius:18px;padding:30px 26px;">%(body)s</td></tr>
<tr><td align="center" style="padding:22px 10px 0;">
<div style="font:400 12px %(font)s;line-height:1.6;color:%(muted)s;">
Du får det här mejlet för att du dokumenterar din Envana-resa.<br>
Bilderna är dina. Vi visar dem aldrig för någon utan att fråga dig först.<br>
<a href="{%% unsubscribe %%}" style="display:inline-block;padding:14px 10px;color:%(muted)s;">Avsluta påminnelserna</a>
</div></td></tr>
</table></td></tr></table></body></html>""" % dict(bg=BG, pre=preheader, font=FONT, head=HEAD,
                                                  surface=SURFACE, body=body, muted=MUTED)

H = 'style="font:700 24px %s;line-height:1.3;color:%s;margin:0 0 10px;"' % (FONT, HEAD)
P = 'style="font:400 16px %s;line-height:1.62;color:%s;margin:0 0 16px;"' % (FONT, MUTED)

# ---------------------------------------------------------------- 1. KVITTENS
# En mall for alla tre tillfallena. Rubrik och text villkoras pa event.steg,
# serien ritas efter antal_bilder. Det ar de TOMMA rutorna som gor jobbet.
if OUT.endswith("kvittens"):
    if MODE == "klaviyo":
        # INGEN steg 3-variant. Vid sista bilden gar SLUTMAILET ut, och de sa
        # ordagrant samma sak: hela serien plus presentkortet pa vag. Tva mail
        # i inkorgen samtidigt med samma besked. Flodet i Klaviyo ska villkora
        # bort kvittensen nar event.steg == '3'.
        rubrik = ("{% if event.steg == '2' %}Halvvägs, en bild kvar"
                  "{% else %}Första bilden är sparad{% endif %}")
        text = ("{% if event.steg == '2' %}Trettio dagar sedan startbilden. Nästa bild är den "
                "sista, och det är mellan nu och då som förändringen brukar vara som störst."
                "{% else %}Vi hör av oss om 30 dagar när det är dags för nästa. Titta efter "
                "naglarna och håret först - de svarar tidigare än huden.{% endif %}")
        # Villkora pa att BILDEN finns, inte pa hur manga rader kunden har.
        # antal_bilder sa 3 efter tva milstolpar nar en uppladdning gjorts om,
        # och en serie ritad efter ett ANTAL fyllde ruta 1 med en tom URL nar
        # kunden hoppat over ett steg - alltsa en trasig bildikon i mailet.
        serie = ('<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>'
                 + "".join(
                     "{%% if event.bild_%d_url %%}%s{%% else %%}%s{%% endif %%}"
                     % (n, slot_cell(n, "", True), slot_cell(n, "", False))
                     for n in (1, 2, 3))
                 + '</tr><tr>'
                 + "".join(label_cell(("DAG 1", "DAG 30", "DAG 60")[n - 1], True) for n in (1, 2, 3))
                 + '</tr></table>')
    else:
        if VARIANT == "2":
            rubrik, text, serie = ("Halvvägs, en bild kvar",
                "Trettio dagar sedan startbilden. Nästa bild är den sista, och det är mellan "
                "nu och då som förändringen brukar vara som störst.", series(2))
        else:
            rubrik, text, serie = ("Första bilden är sparad",
                "Vi hör av oss om 30 dagar när det är dags för nästa. Titta efter naglarna och "
                "håret först - de svarar tidigare än huden.", series(1))
    body = ('<h1 %s>%s</h1><p %s>%s</p>%s'
            '<p style="font:400 14px %s;line-height:1.6;color:%s;margin:20px 0 0;text-align:center;">'
            'Rutorna fylls i takt med att du laddar upp.</p>' % (H, rubrik, P, text, serie, FONT, MUTED))
    html = shell("Din bild är sparad.", body)

# ------------------------------------------------------------- 2. PAMINNELSE
# Hennes FORRA bild visas stort. Det ar den enda vinkelguidning hon far, och
# den ar battre an en textrad: hon ser hur bilden togs i stallet for att lasa
# om det.
elif OUT.endswith("paminnelse"):
    if MODE == "klaviyo":
        rubrik = ("{% if event.antal_bilder == 2 %}Dags för din sista bild"
                  "{% else %}Dags för bild två{% endif %}")
        forra = cond("event.antal_bilder == 2",
                     par(2, "DAG 30", "DAG 60"),
                     par(1, "DAG 1", "DAG 30"))
    else:
        rubrik = "Dags för din sista bild" if VARIANT == "2" else "Dags för bild två"
        forra = par(2, "DAG 30", "DAG 60") if VARIANT == "2" else par(1, "DAG 1", "DAG 30")
    body = (
      '<h1 %s>%s</h1>'
      '<p %s>Så här såg din förra bild ut. Ställ dig på samma plats, i samma ljus och håll '
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
# Hela serien, sedan pengarna, sedan fragan. Ordningen ar avsiktlig: fragan
# stalls nar hon just sett sin egen forandring OCH blivit betald.
else:
    body = (
      '<h1 %s>Tre bilder, 60 dagar</h1>'
      '<p %s>Här är hela din resa. Bilderna är tagna av dig, på dig, med 30 dagars mellanrum.</p>'
      '%s'
      '<div style="height:26px;"></div>'
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">'
      '<tr><td align="center" style="border-top:1px solid #f1e5e0;padding:26px 0 0;">'
      '%s'
      '<p style="font:400 15px %s;line-height:1.6;color:%s;margin:16px 0 0;">'
      'Ditt presentkort är på väg till den här inkorgen. Det är ditt, oavsett vad du svarar '
      'på frågan nedan.</p></td></tr></table>'
      '<div style="height:26px;"></div>'
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">'
      '<tr><td style="border-top:1px solid #f1e5e0;padding:26px 0 0;">'
      '<h2 style="font:700 20px %s;line-height:1.35;color:%s;margin:0 0 10px;">Får vi visa dina bilder?</h2>'
      '<p %s>Vi letar efter äkta före och efter från riktiga kunder. Säger du ja skickar vi '
      '<strong style="color:%s;">200 kr till</strong>. Säger du nej händer ingenting, och '
      'bilderna förblir dina.</p>%s</td></tr></table>'
      % (H, P, series(3), gift(), FONT, MUTED, FONT, HEAD, P, HEAD, button("Svara på frågan", lank(SAMTYCKE_BAS))))
    html = shell("Hela din 60-dagarsserie, och dina 200 kr.", body)

io.open(OUT + "." + MODE + ".html", "w", encoding="utf-8").write(html)
print("skrev", OUT + "." + MODE + ".html", len(html), "tecken")
