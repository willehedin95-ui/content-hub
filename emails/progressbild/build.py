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

BRAND, BG, SURFACE, HEAD, MUTED = "#f0573d", "#fefaf8", "#ffffff", "#320d01", "#7e6458"
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

def slot_cell(n, label, filled, width=164):
    """En ruta i serien. Fylld = hennes bild. Tom = det som drar tillbaka henne."""
    if filled:
        # height satt explicit: den tomma rutans 2px-ram laggs UTANFOR hojden i
        # mail, sa en bild pa 183 och en tom ruta pa 183 blev 183 mot 187 och
        # etiketterna hamnade pa olika rader. Uppmatt i den renderade bilden.
        inner = (
          '<img src="%s" width="%d" height="187" alt="%s" style="display:block;width:%dpx;'
          'height:187px;object-fit:cover;border-radius:10px;border:0;">'
          '<div style="font:700 11px %s;letter-spacing:.6px;color:%s;padding-top:7px;">%s</div>'
          % (img(str(n), label), width, label, width, FONT, HEAD, label)
        )
    else:
        inner = (
          '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="%d"><tr>'
          '<td height="183" align="center" valign="middle" style="width:%dpx;height:183px;'
          'background:#f7ece8;border:2px dashed %s;border-radius:10px;">'
          '<span style="font:700 26px %s;color:%s;opacity:.45;">?</span></td></tr></table>'
          '<div style="font:700 11px %s;letter-spacing:.6px;color:%s;padding-top:7px;">%s</div>'
          % (width, width, BRAND, FONT, BRAND, FONT, MUTED, label)
        )
    return '<td align="center" valign="top" style="padding:0 5px;">%s</td>' % inner

def series(filled_count):
    cells = "".join(
        slot_cell(n, ("DAG 1", "DAG 30", "DAG 60")[n - 1], n <= filled_count)
        for n in (1, 2, 3)
    )
    return ('<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">'
            '<tr>' + cells + '</tr></table>')

def button(text, href="#"):
    return (
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">'
      '<tr><td align="center" bgcolor="%s" style="border-radius:12px;">'
      '<a href="%s" style="display:inline-block;padding:16px 34px;font:700 17px %s;'
      'color:#ffffff;text-decoration:none;border-radius:12px;">%s</a></td></tr></table>'
      % (BRAND, href, FONT, text)
    )

def gift(amount="200 kr", sub="Presentkort"):
    return (
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="200" align="center">'
      '<tr><td bgcolor="%s" style="border-radius:13px;padding:16px 18px;">'
      '<div style="font:700 10px %s;letter-spacing:1.8px;color:#ffffff;opacity:.9;">%s</div>'
      '<div style="font:800 32px %s;color:#ffffff;padding-top:6px;">%s</div>'
      '<div style="font:700 10px %s;letter-spacing:2.6px;color:#ffffff;opacity:.92;padding-top:8px;">ENVANA</div>'
      '</td></tr></table>' % (BRAND, FONT, sub.upper(), FONT, amount, FONT)
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
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%%;">
<tr><td align="center" style="padding:0 0 22px;">
<div style="font:700 13px %(font)s;letter-spacing:3.4px;color:%(head)s;">ENVANA</div></td></tr>
<tr><td style="background:%(surface)s;border-radius:18px;padding:30px 26px;">%(body)s</td></tr>
<tr><td align="center" style="padding:22px 10px 0;">
<div style="font:400 12px %(font)s;line-height:1.6;color:%(muted)s;">
Du får det här mejlet för att du dokumenterar din Envana-resa.<br>
Bilderna är dina. Vi visar dem aldrig för någon utan att fråga dig först.<br>
<a href="{%% unsubscribe %%}" style="color:%(muted)s;">Avsluta påminnelserna</a>
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
        rubrik = ("{% if event.steg == '3' %}Din resa är klar{% elif event.steg == '2' %}"
                  "Halvvägs, en bild kvar{% else %}Första bilden är sparad{% endif %}")
        text = ("{% if event.steg == '3' %}Tre bilder, 60 dagar. Nedan ser du hela din serie, "
                "och ditt presentkort är på väg."
                "{% elif event.steg == '2' %}Trettio dagar sedan startbilden. Nästa bild är den "
                "sista, och det är mellan nu och då som förändringen brukar vara som störst."
                "{% else %}Vi hör av oss om 30 dagar när det är dags för nästa. Titta efter "
                "naglarna och håret först - de svarar tidigare än huden.{% endif %}")
        serie = ("{% if event.antal_bilder == 3 %}" + series(3) +
                 "{% elif event.antal_bilder == 2 %}" + series(2) + "{% else %}" + series(1) + "{% endif %}")
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
                     '<img src="{{ event.bild_2_url }}" width="240" alt="Din bild fran dag 30" '
                     'style="display:block;width:240px;height:auto;border-radius:12px;border:0;margin:0 auto;">',
                     '<img src="{{ event.bild_1_url }}" width="240" alt="Din startbild" '
                     'style="display:block;width:240px;height:auto;border-radius:12px;border:0;margin:0 auto;">')
    else:
        rubrik = "Dags för bild två"
        forra = ('<img src="dag1.jpg" width="240" alt="Din startbild" '
                 'style="display:block;width:240px;height:auto;border-radius:12px;border:0;margin:0 auto;">')
    body = (
      '<h1 %s>%s</h1>'
      '<p %s>Så här såg din förra bild ut. Ställ dig på samma plats, i samma ljus och håll '
      'telefonen lika högt, så blir jämförelsen rättvis.</p>'
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%%">'
      '<tr><td align="center" style="padding:4px 0 8px;">%s'
      '<div style="font:700 11px %s;letter-spacing:.6px;color:%s;padding-top:9px;">DIN FÖRRA BILD</div>'
      '</td></tr></table>'
      '<div style="height:22px;"></div>%s'
      '<p style="font:400 14px %s;line-height:1.6;color:%s;margin:18px 0 0;text-align:center;">'
      'Tar 30 sekunder. Presentkortet på 200 kr kommer när alla tre är inne.</p>'
      % (H, rubrik, P, forra, FONT, MUTED, button("Ta bilden"), FONT, MUTED))
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
      % (H, P, series(3), gift(), FONT, MUTED, FONT, HEAD, P, HEAD, button("Svara på frågan")))
    html = shell("Hela din 60-dagarsserie, och dina 200 kr.", body)

io.open(OUT + "." + MODE + ".html", "w", encoding="utf-8").write(html)
print("skrev", OUT + "." + MODE + ".html", len(html), "tecken")
