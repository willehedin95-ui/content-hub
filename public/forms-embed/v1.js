/**
 * Content Hub self-hosted form embed (v1).
 *
 * Usage on a Shopify page (Custom Liquid / HTML block):
 *   <div id="ch-form"></div>
 *   <script src="https://content-hub-nine-theta.vercel.app/forms-embed/v1.js"
 *           data-workspace="hydro13" data-form="kontakt" data-market="se"
 *           data-target="#ch-form" defer></script>
 *
 * Fetches the form config from the hub, renders it, validates client-side,
 * uploads files, then POSTs the submission. The submit endpoint persists
 * first and returns { gate } so the correct ending (success / för sent /
 * för tidigt) is shown. clientSubmissionId is generated once per page load,
 * so retries after network errors can never create duplicates.
 *
 * XSS note: all user-influenced strings go through textContent. innerHTML is
 * used ONLY for first-party form config authored in our own hub DB (intro,
 * info blocks, endings) - the same trust level as the page's own markup.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var HUB = script.getAttribute("data-hub") || new URL(script.src).origin;
  var WORKSPACE = script.getAttribute("data-workspace") || "";
  var FORM_SLUG = script.getAttribute("data-form") || "";
  var MARKET = script.getAttribute("data-market") || "se";
  var TARGET_SEL = script.getAttribute("data-target") || "";
  // Testläge: submission sparas märkt is_test, ingen helpdesk-ticket skapas
  var IS_TEST = script.getAttribute("data-test") === "1";

  var container = TARGET_SEL ? document.querySelector(TARGET_SEL) : null;
  if (!container) {
    container = document.createElement("div");
    script.parentNode.insertBefore(container, script.nextSibling);
  }
  container.classList.add("chf-root");

  var clientSubmissionId =
    (window.crypto && window.crypto.randomUUID && window.crypto.randomUUID()) ||
    "f-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);

  var state = {
    config: null,
    values: {},
    files: {}, // key -> File[]
    submitting: false,
    currentStep: 0, // pagebreak-delade formulär (t.ex. tvåstegs ångerrätt)
    app: false, // config.theme.mode === "app": fullskärms onboarding-skal
    customer: null, // uppslag pa ?t= - hennes adress och tidigare bilder
  };

  // ------------------------------------------------------------------- sprak
  // Runtimens egna texter. Formularens INNEHALL kommer fran configen och ar
  // redan pa ratt sprak, men det har lagret - knappar, felmeddelanden,
  // stegraknaren, frivillig-markeringen - var hardkodat svenskt. En dansk kund
  // pa ett danskt formular fick "Steg 1 av 2", "Tillbaka" och "Det har faltet
  // ar obligatoriskt.". Uppmatt i produktion 2026-09-21.
  //
  // Orden ar hamtade ur butikens EGNA locale-filer (locales/da.json,
  // locales/no.json i Palo Alto-temat) sa formularet later som resten av
  // butiken: "Obligatorisk felt", "(valgfrit)" / "(valgfritt)", "Luk"/"Lukk",
  // "trin"/"trinn", "Send inn".
  var SPRAK = {
    se: {
      back: "Tillbaka",
      step: function (i, n) { return "Steg " + i + " av " + n; },
      close: "Stäng",
      optional: " (valfritt)",
      continue: "Fortsätt",
      submit: "Skicka in",
      honeypot: "Lämna fältet tomt",
      choose: "Välj ett alternativ",
      pickImage: "Välj en bild",
      pickImageSub: "Tryck här för att ta en ny bild eller välja en du redan har",
      looksGood: "Ser den bra ut?",
      retake: "Ta om",
      retakeAria: "Ta om bilden",
      required: "Det här fältet är obligatoriskt.",
      badEmail: "Ange en giltig e-postadress.",
      sending: "Skickar...",
      genericError: "Något gick fel. Försök igen.",
      networkError: "Något gick fel. Kontrollera din uppkoppling och försök igen - dina svar finns kvar.",
      loading: "Laddar formulär...",
      loadError: "Formuläret kunde inte laddas just nu. Ladda om sidan eller försök igen om en stund.",
    },
    dk: {
      back: "Tilbage",
      step: function (i, n) { return "Trin " + i + " af " + n; },
      close: "Luk",
      optional: " (valgfrit)",
      continue: "Fortsæt",
      submit: "Send ind",
      honeypot: "Lad feltet stå tomt",
      choose: "Vælg et alternativ",
      pickImage: "Vælg et billede",
      pickImageSub: "Tryk her for at tage et nyt billede eller vælge et, du allerede har",
      looksGood: "Ser det godt ud?",
      retake: "Tag om",
      retakeAria: "Tag billedet om",
      required: "Dette felt er obligatorisk.",
      badEmail: "Indtast venligst en gyldig e-mailadresse.",
      sending: "Sender...",
      genericError: "Noget gik galt. Prøv igen.",
      networkError: "Noget gik galt. Tjek din forbindelse, og prøv igen - dine svar er gemt.",
      loading: "Indlæser formular...",
      loadError: "Formularen kunne ikke indlæses lige nu. Genindlæs siden, eller prøv igen om lidt.",
    },
    no: {
      back: "Tilbake",
      step: function (i, n) { return "Trinn " + i + " av " + n; },
      close: "Lukk",
      optional: " (valgfritt)",
      continue: "Fortsett",
      submit: "Send inn",
      honeypot: "La feltet stå tomt",
      choose: "Velg et alternativ",
      pickImage: "Velg et bilde",
      pickImageSub: "Trykk her for å ta et nytt bilde eller velge ett du allerede har",
      looksGood: "Ser det bra ut?",
      retake: "Ta om",
      retakeAria: "Ta bildet om",
      required: "Dette feltet er obligatorisk.",
      badEmail: "Oppgi en gyldig e-postadresse.",
      sending: "Sender...",
      genericError: "Noe gikk galt. Prøv igjen.",
      networkError: "Noe gikk galt. Sjekk tilkoblingen din og prøv igjen - svarene dine er lagret.",
      loading: "Skjemaet lastes...",
      loadError: "Skjemaet kunne ikke lastes akkurat nå. Last inn siden på nytt, eller prøv igjen om litt.",
    },
  };
  // Okand marknad faller pa svenska - butikens sprak, inte ett tomt falt.
  var T = SPRAK[MARKET] || SPRAK.se;

  // ------------------------------------------------------------------ styles
  var CSS =
    // Butikens egna typsnitt, samma filer som resten av shopenvana.com
    // serverar. Sidan /pages/resa kor en egen layout utan temats CSS, sa utan
    // det har faller formularet tillbaka pa systemfonten och ser ut som en
    // blankett i stallet for som Envana.
    //
    // Bagoss finns BARA i 400 och 500 - darfor 400 pa rubriker, precis som
    // butiken sjalv gor (.ehow__step-title), inte 700 som en fetare font hade
    // talat. Hanken Grotesk ar variabel och bar brodtexten.
    "@font-face{font-family:\'Bagoss Standard\';font-style:normal;font-weight:400;" +
    "font-display:swap;src:url(https://shopenvana.com/cdn/shop/t/3/assets/envana-font-bagossstandard-400.woff2) format(\'woff2\')}" +
    "@font-face{font-family:\'Bagoss Standard\';font-style:normal;font-weight:500;" +
    "font-display:swap;src:url(https://shopenvana.com/cdn/shop/t/3/assets/envana-font-bagossstandard-500.woff2) format(\'woff2\')}" +
    "@font-face{font-family:\'Hanken Grotesk\';font-style:normal;font-weight:100 900;" +
    "font-display:swap;src:url(https://shopenvana.com/cdn/shop/t/3/assets/envana-font-hankengrotesk-variable.woff2) format(\'woff2\')}" +
    ".chf-root{font-family:\'Hanken Grotesk\',-apple-system,BlinkMacSystemFont,\'Segoe UI\',Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;padding:0 20px;box-sizing:border-box;color:#1a1a1a;line-height:1.55}" +
    ".chf-title{font-size:1.75em;font-weight:700;margin:0 0 14px}" +
    ".chf-intro{margin:0 0 20px}" +
    ".chf-intro p{margin:0 0 10px}" +
    ".chf-field{margin:0 0 18px}" +
    ".chf-label{display:block;font-weight:600;margin-bottom:6px}" +
    ".chf-req{color:#b91c1c;margin-left:2px}" +
    ".chf-help{font-size:.88em;color:#555;margin:-2px 0 6px}" +
    ".chf-input,.chf-textarea,.chf-select{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #ccc;border-radius:8px;font:inherit;background:#fff}" +
    ".chf-input:focus,.chf-textarea:focus,.chf-select:focus{outline:2px solid #1a1a1a;outline-offset:0;border-color:#1a1a1a}" +
    ".chf-textarea{min-height:110px;resize:vertical}" +
    ".chf-radio-group{display:flex;flex-direction:column;gap:8px}" +
    ".chf-radio{display:flex;align-items:flex-start;gap:8px;padding:10px 12px;border:1px solid #ccc;border-radius:8px;cursor:pointer;background:#fff}" +
    ".chf-radio input{margin-top:3px}" +
    ".chf-check{display:flex;align-items:flex-start;gap:10px;cursor:pointer}" +
    ".chf-check input{margin-top:4px}" +
    ".chf-check-title{font-weight:700}" +
    // Instruktionerna ar sidans innehall, inte en notis. Blatonad ruta med ram
    // last som "varning/systemmeddelande" och gjorde texten latt att hoppa over.
    ".chf-info{margin:0 0 18px}" +
    ".chf-info h2{font-size:1.25em;font-weight:700;margin:0 0 8px;line-height:1.3}" +
    ".chf-info p{margin:0 0 8px}" +
    ".chf-info p:last-child{margin-bottom:0}" +
    ".chf-info a{color:#1d4ed8;text-decoration:underline}" +
    // Uppladdningszonen: hela rutan ar tryckyta. Den nakna <input type=file>
    // renderas som webblasarens "Valj fil"-knapp pa 22px, vilket ar halva
    // minsta tryckyta och ser ut som ett systemfel pa den viktigaste
    // interaktionen i formularet.
    ".chf-file{position:relative;border:1.5px dashed #bbb;border-radius:12px;background:#fafafa;" +
    "min-height:132px;display:flex;flex-direction:column;align-items:center;justify-content:center;" +
    "gap:6px;padding:20px;text-align:center;cursor:pointer;transition:border-color .15s,background .15s}" +
    ".chf-file:hover,.chf-file.chf-file-over{border-color:#111;background:#f3f4f6}" +
    ".chf-file input[type=file]{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}" +
    ".chf-file-icon{width:34px;height:34px;opacity:.45}" +
    ".chf-file-main{font-weight:600}" +
    ".chf-file-sub{font-size:.86em;color:#555}" +
    ".chf-file-preview{display:flex;align-items:center;gap:12px;text-align:left;width:100%}" +
    ".chf-file-preview img{width:64px;height:64px;object-fit:cover;border-radius:8px;flex:none}" +
    ".chf-file-name{font-size:.9em;word-break:break-word;flex:1}" +
    ".chf-file-change{font-size:.86em;text-decoration:underline;color:#555}" +
    ".chf-file-clear{margin-top:6px;font:inherit;font-size:.86em;background:none;border:0;text-decoration:underline;color:#555;cursor:pointer;position:relative;z-index:2}" +
    // Stegindikator: ett flerstegsformular ska visa var man ar.
    ".chf-steps{display:flex;align-items:center;gap:10px;margin:0 0 16px}" +
    ".chf-steps-label{font-size:.85em;color:#555;font-weight:600;white-space:nowrap}" +
    ".chf-steps-track{flex:1;height:5px;background:#e8e8e8;border-radius:999px;overflow:hidden}" +
    ".chf-steps-fill{height:100%;background:#111;border-radius:999px;width:0;transition:width .3s ease}" +
    // Tillbaka: sekundar, alltid minst 44px hog trots att den ar textlank.
    ".chf-back{display:block;width:100%;margin-top:10px;padding:12px;background:none;border:0;" +
    "font:inherit;color:#555;text-decoration:underline;cursor:pointer;min-height:44px}" +
    ".chf-optional{font-weight:400;color:#555}" +
    // App-onboarding-anatomi, matt fran Ember/Weightless (SlideMetrics.swift):
    // bildblocket overst pa 40% av skarmhojden (min 210, max 330), texten i en
    // TAT klump under - aldrig lodratt centrerad. Centrerat innehall lamnar en
    // tom halva over rubriken och laser som att skarmen inte laddat klart.
    ".chf-art{display:flex;align-items:center;justify-content:center;" +
    "height:clamp(150px,34vh,300px);margin:0 0 4px}" +
    ".chf-art svg{width:auto;height:58%;max-height:150px;color:#8a6a12;opacity:.9}" +
    ".chf-slide-title{text-align:center;font-size:1.45em;font-weight:700;line-height:1.25;margin:0 0 8px}" +
    ".chf-slide-sub{text-align:center;color:#555;margin:0 0 18px;font-size:.95em}" +
    // Tipsrutnat: samma monster som selfieguiden i Hydro13-appen (2x2 kort med
    // ikon, kort rubrik, en rad text). Instruktioner om hur man tar ett bra
    // foto ar visuella till sin natur - som brodtext blir de hoppade over.
    ".chf-tips{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 12px}" +
    ".chf-tip{border:1px solid #e5e5e5;border-radius:10px;padding:12px;background:#fff}" +
    ".chf-tip svg{width:22px;height:22px;display:block;margin-bottom:7px;color:#8a6a12}" +
    ".chf-tip b{display:block;font-size:.95em;margin-bottom:2px}" +
    ".chf-tip span{font-size:.85em;color:#555;line-height:1.35}" +
    ".chf-avoid{display:flex;gap:9px;align-items:flex-start;font-size:.88em;color:#555;" +
    "background:#fdf6f6;border-radius:9px;padding:11px 13px;margin:0}" +
    ".chf-avoid svg{width:17px;height:17px;flex:none;margin-top:1px;color:#b45309}" +
    ".chf-error{color:#b91c1c;font-size:.9em;margin-top:5px;display:none}" +
    ".chf-field.chf-invalid .chf-error{display:block}" +
    ".chf-field.chf-invalid .chf-input,.chf-field.chf-invalid .chf-textarea,.chf-field.chf-invalid .chf-select{border-color:#b91c1c}" +
    ".chf-submit{display:block;width:100%;padding:14px 18px;background:#111;color:#fff;border:0;border-radius:10px;font:inherit;font-weight:500;font-size:1.05em;cursor:pointer;font-family:'Bagoss Standard',Georgia,serif;letter-spacing:-.02em;}" +
    ".chf-submit:disabled{opacity:.6;cursor:default}" +
    ".chf-toperror{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:10px;padding:12px 14px;margin-bottom:16px;display:none}" +
    ".chf-ending{text-align:left;padding:8px 0}" +
    ".chf-ending h2{font-size:1.75em;font-weight:700;margin:0 0 14px}" +
    ".chf-hp{position:absolute;left:-9999px;opacity:0;height:0;overflow:hidden}" +
    ".chf-loading{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}" +
    // Skeleton: mirrors the real field rhythm (label + control, 18px apart) so
    // the form does not jump when it swaps in.
    ".chf-sk{background:#ececec;position:relative;overflow:hidden}" +
    ".chf-sk::after{content:'';position:absolute;top:0;right:0;bottom:0;left:0;" +
      "transform:translateX(-100%);background:linear-gradient(90deg,rgba(255,255,255,0)," +
      "rgba(255,255,255,.7),rgba(255,255,255,0));animation:chf-shimmer 1.4s ease-in-out infinite}" +
    "@keyframes chf-shimmer{100%{transform:translateX(100%)}}" +
    "@media (prefers-reduced-motion:reduce){.chf-sk::after{animation:none}}" +
    ".chf-sk-field{margin:0 0 18px}" +
    ".chf-sk-label{height:13px;border-radius:4px;margin-bottom:8px}" +
    ".chf-sk-input{height:42px;border-radius:8px}" +
    ".chf-sk-info{height:76px;border-radius:10px;margin:0 0 18px}" +
    ".chf-sk-btn{height:50px;border-radius:10px;margin-top:26px}";

  // ----------------------------------------------- app-onboarding-laget
  // Slas pa av config.theme.mode === "app" och galler BARA under .chf-app, sa
  // kontakt- och angerrattsformularen ar helt oberorda. De ar formular. Det
  // har ar en resa och ska se ut som en.
  //
  // Anatomin ar MATT ur quiz-runtimen (runtime/quiz-runtime/src/renderer.tsx),
  // samma funnel som doginwork-quizet, inte en egen tolkning av "app-kansla":
  //   rund tillbakaknapp 36px pa rgba(0,0,0,.04), header-padding 14/20,
  //   progressbar 4px kant till kant, innehall max 640 med 24/20/64,
  //   rubrik 22/700 line-height 1.35, brodtext 16/1.6, CTA min-height 56 och
  //   radius 12 med active:scale(.98), valkort radius 16 med 2px ram,
  //   steg-in 0.28s opacity (ALDRIG transform - en transform pa steget skapar
  //   containing block och sanker position:fixed hos barnen, samma fallgrop
  //   som kommentaren i renderer.tsx varnar for).
  //
  // Paletten kommer fran Envanas designsystem i Figma, inte ur luften:
  // brand/500 #f0573d, bg/base #fefaf8, text/heading #320d01, text/muted
  // #7e6458. Varden gar att skriva over per formular via config.theme.
  var APP_CSS =
    // Full-bleed utan layoutandring: box-shadow + clip-path malar bakgrunden
    // at bada hallen ut till skarmkanten medan elementet behaller sin bredd.
    // 100vw + negativ marginal (quiz-runtimens teknik) ger horisontell scroll
    // sa fort vardsidan har en synlig scrollbar, och embedden ligger i nagon
    // annans sida dar jag inte rar over overflow.
    ".chf-app{--chf-brand:#f0573d;--chf-bg:#fefaf8;--chf-surface:#fff;" +
    "--chf-text:#320d01;--chf-muted:#7e6458;" +
    "max-width:none;padding:0;background:var(--chf-bg);color:var(--chf-text);" +
    "box-shadow:0 0 0 100vmax var(--chf-bg);clip-path:inset(0 -100vmax);" +
    // Fyller skarmen sa vyn tar slut vid skarmkanten, inte mitt pa sidan.
    // --chf-app-offset later vardsidan kompensera for sin egen header
    // (Shopify-temat): sattes den till headerns hojd forsvinner scrollen.
    "min-height:calc(100svh - var(--chf-app-offset,0px));" +
    "display:flex;flex-direction:column}" +
    "@supports not (height:100svh){.chf-app{min-height:calc(100vh - var(--chf-app-offset,0px))}}" +

    // Header: rund tillbakaknapp. Ersatter den understrukna "Tillbaka"-lanken
    // langst ner, som ar webbmonster - i en app sitter backen uppe till
    // vanster och ar alltid pa samma stalle oavsett hur langt steget ar.
    ".chf-app .chf-head{position:relative;display:flex;align-items:center;padding:14px 20px;min-height:64px;" +
    "width:100%;max-width:680px;margin:0 auto;box-sizing:border-box}" +
    // Loggan absolut centrerad: headern bar en tillbakaknapp till vanster som
    // finns pa vissa steg och inte pa andra, och en logga som flyttar sig med
    // knappen laser som att skarmen hoppar mellan stegen.
    ".chf-app .chf-logo{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);" +
    "height:17px;color:var(--chf-text);opacity:.9;pointer-events:none}" +
    ".chf-app .chf-logo img{display:block;height:100%;width:auto}" +
    // Ett enstegsformular har varken tillbakaknapp eller stapel. Da ar headern
    // 64 px tom yta som trycker ner rubriken utan att bara nagot.
    ".chf-app.chf-bare .chf-head{min-height:0;padding:12px 20px 0}" +
    ".chf-app .chf-headback{width:44px;height:44px;padding:0;border:0;border-radius:50%;" +
    "background:rgba(0,0,0,.04);color:var(--chf-text);display:flex;align-items:center;" +
    "justify-content:center;cursor:pointer;transition:background .15s,transform .15s}" +
    ".chf-app .chf-headback:hover{background:rgba(0,0,0,.08)}" +
    ".chf-app .chf-headback:active{transform:scale(.94)}" +
    ".chf-app .chf-headback svg{width:20px;height:20px}" +
    ".chf-app .chf-headback[hidden]{visibility:hidden}" +

    // Progressbar kant till kant under headern. Den gamla satt inne i
    // innehallet med texten "Steg 2 av 3" bredvid; en app raknar inte upp
    // stegen for dig, den visar hur langt strecket har gatt.
    ".chf-app .chf-track{height:4px;background:rgba(0,0,0,.06);overflow:hidden;flex:none}" +
    ".chf-app .chf-fill{height:100%;background:var(--chf-brand);width:0;transition:width .3s ease}" +
    ".chf-app .chf-track[hidden]{display:none}" +
    ".chf-app .chf-steps{display:none}" +
    ".chf-app .chf-back{display:none}" +

    ".chf-app .chf-body{width:100%;max-width:640px;margin:0 auto;padding:24px 20px 40px;" +
    "box-sizing:border-box;flex:1;display:flex;flex-direction:column}" +
    ".chf-app .chf-form{flex:1;display:flex;flex-direction:column}" +

    // Steget fyller resten av skarmen och CTA:n trycks till botten (margin-top
    // auto pa knappen). Det ar det som gor att ett kort steg ser fardigt ut i
    // stallet for att lamna en tom halva under sig.
    ".chf-app .chf-step{flex:1;display:flex;flex-direction:column;" +
    "padding-bottom:calc(20px + env(safe-area-inset-bottom,0px))}" +
    ".chf-app .chf-step.chf-in{animation:chf-step-in .28s ease-out both}" +
    "@keyframes chf-step-in{from{opacity:0}to{opacity:1}}" +
    "@media (prefers-reduced-motion:reduce){.chf-app .chf-step.chf-in{animation:none}}" +
    ".chf-app .chf-step>.chf-submit{margin-top:auto}" +
    // Nar tangentbordet ar uppe ar den pinnade knappen kvar pa sin plats
    // LANGST NER i layouten, alltsa bakom tangentbordet. William sag den
    // halvtackt bakom iOS-tangentbordet vid forsta riktiga testet. Da ska
    // knappen sluta vara pinnad och folja direkt efter faltet i stallet.
    ".chf-app.chf-kb .chf-step>.chf-submit{margin-top:16px}" +
    ".chf-app.chf-kb .chf-art{display:none}" +

    ".chf-app .chf-slide-title{font-size:22px;font-weight:400;line-height:1.35;font-family:'Bagoss Standard',Georgia,serif;letter-spacing:-.02em;" +
    "color:var(--chf-text);margin:0 0 6px}" +
    ".chf-app .chf-slide-sub{font-size:16px;line-height:1.6;color:var(--chf-muted);margin:0 0 20px}" +
    // Karusellens typografi ar Weightless egna, uppmatt i IntroCarousel:
    // rubriken 29 bold pa EN rad som KRYMPER i stallet for att brytas (den
    // langsta panelrubriken ar en rad), brodtexten 16 SEMIBOLD och centrerad,
    // 10 px mellan dem. Mina 22/regular last som ett formular.
    ".chf-app .chf-panel .chf-slide-title{font-size:29px;font-weight:400;line-height:1.18;font-family:'Bagoss Standard',Georgia,serif;letter-spacing:-.02em;" +
    "letter-spacing:-.4px;margin:0 0 10px;white-space:nowrap;overflow:hidden;text-overflow:clip}" +
    ".chf-app .chf-panel .chf-slide-sub{font-size:16px;font-weight:600;line-height:1.5;margin:0}" +
    // Krymp rubriken pa smal skarm i stallet for att bryta den. CSS har inget
    // minimumScaleFactor, sa taket satts per brytpunkt - uppmatt mot den
    // langsta rubriken vi har.
    "@media (max-width:400px){.chf-app .chf-panel .chf-slide-title{font-size:25px}}" +
    "@media (max-width:344px){.chf-app .chf-panel .chf-slide-title{font-size:22px}}" +
    // Luften ner mot chromet. Weightless: padding-bottom 96.
    ".chf-app .chf-panel>*:last-child{margin-bottom:0}" +
    ".chf-app .chf-title{font-size:22px;font-weight:400;line-height:1.35;text-align:center;margin:0 0 6px;font-family:'Bagoss Standard',Georgia,serif;letter-spacing:-.02em;}" +
    ".chf-app .chf-info{font-size:16px;line-height:1.6;color:var(--chf-muted)}" +
    ".chf-app .chf-info h2{color:var(--chf-text)}" +
    // Bildblocket ar 40% av skarmhojden med golv 210 och tak 330 - talen ar
    // SlideMetrics.artHeight ur Ember, matta dar och inte gissade har. Ett
    // fast tal kan inte vara ratt pa bade en SE och en 17 Pro. Ikonen ar 52%
    // av blocket: Ember kor 64%, men det galler en maskot med fylld kropp -
    // en tunn linjeikon i den storleken laser som en uppforstorad ikon, inte
    // som en illustration.
    ".chf-app .chf-art{height:clamp(190px,34vh,300px);margin:0 0 4px}" +
    // height:100%, inte en andel. Ikonerna ar 24x24-viewBoxar dar motivet
    // sallan fyller mer an halva hojden (kuvertet gar fran y=6 till y=18), sa
    // en svg satt till 52% ritade ett 85 px stort kuvert i ett 325 px block -
    // blocket sag trasigt tomt ut och luften lastes som ett laddningsfel.
    // Motivet far styra sin egen storlek, blocket satter taket.
    ".chf-app .chf-art svg{color:var(--chf-brand);opacity:1;height:100%;max-height:none}" +
    // Halv hojd for skarmar dar bilden INTE ar hjalten. En skarm med fyra
    // valkort har redan sitt innehall; full bildhojd dar trycker ner valen
    // under vecket och gor bilden till konkurrent i stallet for inramning.
    // Quizets egna valskarmar har ingen bild alls - det har ar mellanlaget.
    ".chf-app .chf-art.chf-art-sm{height:clamp(110px,18vh,160px)}" +
    // Foto som bildblock. En riktig bild slar en ikon: hon ser vad hon ska
    // astadkomma i stallet for att lasa om det. Blocket slapper sin fasta
    // hojd nar det bar ett foto, sa bildens egna proportioner far rada.
    ".chf-app .chf-shot{margin:0 0 14px}" +
    // height:auto ar inte valfritt. Utan den vinner bildens height-attribut
    // (presentational hint) och en 1100x614-bild ritades 335x614, alltsa
    // uttanjd till dubbla hojden. Uppmatt i vyn, inte gissat.
    ".chf-app .chf-shot{position:relative}" +
    // Egen ram runt BILDEN. Taggarna satt forut absolut mot <figure>, vars
    // botten inkluderar bildtexten - sa "DAG 1" lag ovanpa texten i stallet
    // for pa bilden. Uppmatt i vyn.
    ".chf-app .chf-shot-frame{position:relative;line-height:0}" +
    ".chf-app .chf-shot img{display:block;width:100%;height:auto;border-radius:16px}" +
    // Dag-etiketter direkt pa bilden. Utan dem ar det tva ansikten bredvid
    // varandra och betraktaren far sjalv gissa vilket som ar fore.
    ".chf-app .chf-shot-tag{position:absolute;bottom:10px;font-size:12px;font-weight:700;line-height:1.25;letter-spacing:.4px;color:#fff;background:rgba(0,0,0,.55);border-radius:999px;padding:4px 10px;backdrop-filter:blur(2px)}" +
    ".chf-app .chf-shot-tag--a{left:10px}" +
    ".chf-app .chf-shot-tag--b{right:10px}" +
    // "Sa har tog du den forra gangen": hennes egen bild bredvid
    // uppladdningen. Mailet kunde redan visa den, men det ar HAR hon star med
    // telefonen och ska traffa samma vinkel igen.
    ".chf-app .chf-forra{display:flex;gap:14px;align-items:center;background:var(--chf-surface);" +
    "border:1px solid rgba(50,13,1,.08);border-radius:16px;padding:12px;margin:0 0 14px}" +
    ".chf-app .chf-forra img{width:82px;height:auto;border-radius:11px;flex:none;display:block}" +
    ".chf-app .chf-forra-txt{font-size:14px;line-height:1.5;color:var(--chf-muted);text-align:left}" +
    ".chf-app .chf-forra-txt b{display:block;color:var(--chf-text);font-size:15px;margin-bottom:2px}" +
    // Introkarusell: tre paneler man swajpar mellan, med prickar och en knapp
    // som STAR STILL. Monstret ar Weightless introCarousel
    // (app-venture/snowball/.../OnboardingModels.swift), dar William bad om
    // det 2026-08-26 med skalet "folk ska veta vad appen GOR innan de fyller i
    // uppgifter" - och dar det i sin tur ar matt ur Mobbin: F1, Mercury, Cleo,
    // Too Good To Go, bunq, Waking Up, MyFitnessPal och Tabby bygger likadant.
    //
    // Panelerna byter INTE plats i sidled, de korsar over PA PLATS. Det ar
    // skillnaden mot en vanlig slider, och det ar det som gor att prickarna
    // och knappen kan sta stilla medan innehallet vaxlar.
    // Karusellen ligger i ett info-block, och det blocket ar en vanlig div.
    // Utan att GORA den till flex har karusellens flex:1 ingenting att vaxa
    // i, och da kan prickarnas margin-top:auto inte trycka dem ner till
    // knappen. Uppmatt: de lag kvar direkt under brodtexten.
    ".chf-app .chf-info:has(.chf-carousel){display:flex;flex-direction:column;flex:1;margin:0}" +
    ".chf-app .chf-carousel{position:relative;flex:1;display:flex;flex-direction:column}" +
    ".chf-app .chf-panel{display:none;flex-direction:column;flex:1}" +
    // flex:0 0 auto och inte flex:1. Vaxte panelen tog den allt utrymme och
    // prickarnas margin-top:auto hade inget kvar att trycka emot, sa de
    // hamnade klistrade under brodtexten i stallet for hos knappen.
    ".chf-app .chf-panel.chf-panel-on{display:flex;flex:0 0 auto;animation:chf-panel-in .26s ease-out both}" +
    "@keyframes chf-panel-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}" +
    "@media (prefers-reduced-motion:reduce){.chf-app .chf-panel.chf-panel-on{animation:none}}" +
    // Prickarna hor till CHROMET, inte till texten. I forlagan star de
    // tillsammans med knappen i botten och rors inte nar panelen vaxlar;
    // klistrade under brodtexten hoppar de i stallet med varje panels hojd.
    ".chf-app .chf-dots{display:flex;gap:7px;justify-content:center;margin-top:auto;padding:18px 0 20px}" +
    ".chf-app .chf-dot{width:7px;height:7px;border-radius:999px;background:rgba(50,13,1,.16);" +
    "transition:background .2s,width .2s}" +
    ".chf-app .chf-dot-on{width:22px;background:var(--chf-brand)}" +
    // "Se exempel" som en KNAPP i stallet for ett eget steg. Monstret ar
    // Stakes photo guide (Mobbin): en lank oppnar ett rutnat med ETT ratt och
    // TRE vanliga fel. Text beskriver ett fel, en bild visar det - och hon kan
    // jamfora sin egen bild mot rutan i stallet for att tolka en mening.
    // Sekundarknapp med ram. Utan ram last den som en lank i brodtexten, och
    // det syntes inte att den gick att trycka pa.
    ".chf-app .chf-guide-btn{display:flex;align-items:center;justify-content:center;gap:8px;" +
    "width:100%;margin:0 0 14px;background:var(--chf-surface);border:1.5px solid " +
    "color-mix(in srgb,var(--chf-brand) 30%,#fff);border-radius:14px;padding:15px 18px;" +
    "font:inherit;font-size:16px;font-weight:600;color:var(--chf-brand);cursor:pointer;" +
    "min-height:52px;transition:background .15s,transform .15s}" +
    ".chf-app .chf-guide-btn:active{transform:scale(.99)}" +
    ".chf-app .chf-guide-btn svg{width:18px;height:18px}" +
    ".chf-modal{position:fixed;inset:0;z-index:2147483000;background:rgba(20,6,2,.72);" +
    "display:flex;align-items:center;justify-content:center;padding:18px;" +
    "animation:chf-fade .18s ease-out both}" +
    "@keyframes chf-fade{from{opacity:0}to{opacity:1}}" +
    ".chf-modal-box{background:var(--chf-surface,#fff);border-radius:18px;padding:16px;" +
    "max-width:520px;width:100%;max-height:92vh;overflow:auto;-webkit-overflow-scrolling:touch}" +
    ".chf-modal-box h3{font-size:19px;font-weight:700;margin:2px 0 4px;color:var(--chf-text,#111)}" +
    ".chf-modal-box p{font-size:14px;line-height:1.55;color:var(--chf-muted,#555);margin:0 0 12px}" +
    ".chf-modal-box img{display:block;width:100%;height:auto;border-radius:12px}" +
    ".chf-modal-close{display:block;width:100%;margin-top:14px;min-height:48px;border:0;" +
    "border-radius:12px;background:var(--chf-brand,#111);color:#fff;font:inherit;font-size:16px;" +
    "font-weight:700;cursor:pointer}" +
    ".chf-app .chf-shot figcaption{display:flex;gap:6px;margin-top:8px;font-size:13px;" +
    "color:var(--chf-muted);text-align:center;justify-content:center}" +
    ".chf-app .chf-shot figcaption b{color:var(--chf-text)}" +
    // Presentkortet. Ritat i SVG och inte genererat som bild: en bildmodell
    // far inte "200 kr" och "ENVANA" ratt, och ett belopp som star fel i en
    // mockup ar ett loftesfel. Se feedback_generate_parts_compose_in_code.
    ".chf-app .chf-reward{display:flex;align-items:center;gap:14px;background:var(--chf-surface);" +
    "border:1px solid rgba(50,13,1,.08);border-radius:16px;padding:14px;margin:22px 0 14px}" +
    ".chf-app .chf-reward svg{width:96px;height:auto;flex:none}" +
    ".chf-app .chf-reward-txt{font-size:14px;line-height:1.5;color:var(--chf-muted);text-align:left}" +
    ".chf-app .chf-reward-txt b{display:block;color:var(--chf-text);font-size:15px;margin-bottom:2px}" +
    // Presentkortet som bildblock: det ar belöningen panelen handlar om, och
    // en paketikon sa bara "present" en gang till. Kortet behaller sina egna
    // fargen, sa chf-art:s currentColor ror det inte. Bredden begransas har -
    // 100% hojd av ett 300 px block hade gjort det 481 px brett.
    ".chf-app .chf-art-kort{display:flex;align-items:center;justify-content:center}" +
    ".chf-app .chf-art-kort svg{height:auto;width:min(272px,74%);max-height:100%}" +
    // Integritetskortet handlar om trygghet, inte om pengar. Hanglas i en
    // tonad cirkel, samma form som avslutningens bockmarke.
    ".chf-app .chf-reward-ikon{width:48px;height:48px;border-radius:50%;flex:none;" +
    "display:flex;align-items:center;justify-content:center;" +
    "background:color-mix(in srgb,var(--chf-brand) 12%,#fff)}" +
    ".chf-app .chf-reward .chf-reward-ikon svg{width:24px;height:24px;color:var(--chf-brand)}" +

    // 16px ar inte estetik: under 16px zoomar iOS Safari in hela sidan nar
    // faltet far fokus, och da hoppar onboardingen ur sin layout.
    ".chf-app .chf-input,.chf-app .chf-textarea,.chf-app .chf-select{" +
    "background:var(--chf-surface);border:2px solid rgba(50,13,1,.12);border-radius:12px;" +
    "padding:15px 16px;font-size:16px;color:var(--chf-text);transition:border-color .15s}" +
    ".chf-app .chf-input::placeholder,.chf-app .chf-textarea::placeholder{color:rgba(126,100,88,.6)}" +
    ".chf-app .chf-input:focus,.chf-app .chf-textarea:focus,.chf-app .chf-select:focus{" +
    "outline:none;border-color:var(--chf-brand)}" +
    ".chf-app .chf-label{font-size:15px;font-weight:600;color:var(--chf-text)}" +
    ".chf-app .chf-help{color:var(--chf-muted);font-size:14px}" +

    ".chf-app .chf-submit{background:var(--chf-brand);color:#fff;border-radius:12px;" +
    "min-height:56px;padding:16px 24px;font-size:18px;font-weight:700;letter-spacing:.2px;" +
    "box-shadow:0 8px 24px rgba(240,87,61,.22);transition:opacity .2s,transform .2s}" +
    ".chf-app .chf-submit:hover{opacity:.92}" +
    ".chf-app .chf-submit:active{transform:scale(.98)}" +
    ".chf-app .chf-submit:disabled{opacity:1;box-shadow:none;" +
    "background:color-mix(in srgb,var(--chf-brand) 45%,#fff)}" +
    ".chf-app .chf-submit-vantar{background:color-mix(in srgb,var(--chf-brand) 30%,#fff);" +
    "box-shadow:none}" +

    // Valkort: samma anatomi som quizets alternativ - 2px ram, radius 16,
    // hela kortet ar tryckyta och det valda fylls i brandfargen. Samtyckets
    // trappa (nej/anonymt/fornamn/fornamn+alder) ar fyra sadana kort.
    ".chf-app .chf-radio-group{gap:10px}" +
    ".chf-app .chf-radio,.chf-app .chf-check{background:var(--chf-surface);" +
    "border:2px solid rgba(50,13,1,.10);border-radius:16px;padding:16px;font-size:16px;" +
    "align-items:center;transition:border-color .2s,background .2s,transform .15s}" +
    ".chf-app .chf-radio:hover{border-color:color-mix(in srgb,var(--chf-brand) 45%,#fff)}" +
    ".chf-app .chf-radio:active{transform:scale(.99)}" +
    ".chf-app .chf-radio:has(input:checked){border-color:var(--chf-brand);" +
    "background:color-mix(in srgb,var(--chf-brand) 7%,#fff)}" +
    ".chf-app .chf-radio input,.chf-app .chf-check input{width:20px;height:20px;margin:0;" +
    "accent-color:var(--chf-brand);flex:none}" +
    ".chf-app .chf-check{align-items:flex-start}" +
    ".chf-app .chf-check input{margin-top:2px}" +

    ".chf-app .chf-tips{gap:12px}" +
    ".chf-app .chf-tip{background:var(--chf-surface);border:1px solid rgba(50,13,1,.08);" +
    "border-radius:16px;padding:14px}" +
    ".chf-app .chf-tip svg{color:var(--chf-brand);width:24px;height:24px}" +
    ".chf-app .chf-tip b{color:var(--chf-text)}" +
    ".chf-app .chf-tip span{color:var(--chf-muted)}" +
    ".chf-app .chf-avoid{background:color-mix(in srgb,var(--chf-brand) 7%,#fff);" +
    "border-radius:12px;color:var(--chf-muted);font-size:14px;padding:12px 14px}" +
    ".chf-app .chf-avoid svg{color:var(--chf-brand)}" +

    // KNAPP, inte drop-area. En streckad ruta att "slappa filer i" ar ett
    // datormonster - pa en telefon finns inget att dra, och rutan blir en
    // onodigt stor tryckyta som dessutom ser ut som ett fel.
    //
    // Uppmatt over sju appar i Mobbin (Polarsteps, Craft, Partiful, GroupMe,
    // MacroFactor, Future Pro, LooksMax): INGEN anvander en drop-area. Alla
    // har en knapp som oppnar systemets egen valjare, dar iOS sjalvt erbjuder
    // "Ta foto" och "Valj fran bibliotek".
    ".chf-app .chf-file{background:var(--chf-brand);border:0;border-radius:14px;" +
    "min-height:58px;flex-direction:row;gap:10px;padding:16px 22px;margin:0 0 10px;" +
    "box-shadow:0 8px 24px rgba(240,87,61,.22);transition:opacity .2s,transform .2s}" +
    ".chf-app .chf-file:active{transform:scale(.98)}" +
    ".chf-app .chf-file-icon{width:22px;height:22px;color:#fff;opacity:1;margin:0}" +
    ".chf-app .chf-file-main{font-size:17px;font-weight:700;color:#fff;letter-spacing:.2px}" +
    // Underraden ar overflodig nar knappen sager vad den gor. Systemets egen
    // valjare forklarar resten.
    ".chf-app .chf-file-sub{display:none}" +
    // Nar en bild ar vald ar det BILDEN som ar ytan, inte knappen.
    ".chf-app .chf-file.chf-has-file{background:var(--chf-surface);box-shadow:none;" +
    "flex-direction:column;padding:12px;min-height:0;border:1px solid rgba(50,13,1,.08)}" +
    // Texten ar VIT i knappskepnaden. Nar rutan blir ett vitt kort maste den
    // bli mork igen, annars star "Ser den bra ut?" vitt pa vitt.
    ".chf-app .chf-file.chf-has-file .chf-file-main{color:var(--chf-text);font-size:16px}" +
    ".chf-app .chf-file.chf-has-file .chf-file-icon{display:none}" +
    ".chf-app .chf-file-preview{flex-direction:column;gap:12px;text-align:center}" +
    ".chf-app .chf-file-preview img{width:100%;height:auto;max-height:30vh;object-fit:contain;" +
    "border-radius:14px;background:rgba(50,13,1,.04)}" +
    ".chf-app .chf-file-name{display:flex;flex-direction:column;align-items:center;gap:8px;" +
    "font-size:14px;color:var(--chf-muted)}" +
    ".chf-app .chf-file-clear{border:1px solid rgba(50,13,1,.16);background:var(--chf-surface);" +
    "border-radius:999px;padding:9px 18px;font:inherit;font-size:14px;font-weight:600;" +
    "text-decoration:none;color:var(--chf-text);cursor:pointer;position:relative;z-index:2;min-height:44px}" +
    // "Tryck for att byta" ar en INSTRUKTION om att ytan runtom ar klickbar,
    // inte en egen lank. Understruken bredvid en riktig knapp last som tva
    // konkurrerande atgarder.
    ".chf-app .chf-file-change{text-decoration:none;color:var(--chf-muted);font-size:13px}" +
    ".chf-app .chf-file-clear:active{transform:scale(.97)}" +
    ".chf-app .chf-file-change{color:var(--chf-brand)}" +

    // CTA-lage (`asCta`). Filfaltet ar INTE langre en knapp - stegets egen CTA
    // oppnar valjaren. Skarmen hade tre knappar och den nedersta sag avstangd
    // ut tills bilden var vald; William: "det ar for manga knappar, CTA ska
    // inte vara disabled". Monstret ar Thea (matningen i vaulten): ledtext,
    // bild, EN knapp.
    ".chf-app .chf-file-cta{background:none;border:0;box-shadow:none;padding:0;margin:0;" +
    "min-height:0;display:block;text-align:left;cursor:default}" +
    // Inputen far inte ligga over nagot: den oppnas programmatiskt, aldrig
    // genom att kunden traffar den. Basregeln sprider ut den over hela
    // wrappern (inset:0), vilket i CTA-lage hade lagt en osynlig tryckyta
    // ovanpa exempelbilden.
    ".chf-app .chf-file-cta input[type=file]{position:absolute;width:1px;height:1px;" +
    "opacity:0;pointer-events:none}" +
    ".chf-app .chf-file-cta .chf-file-preview{gap:0}" +
    ".chf-app .chf-file-cta .chf-file-title{font-size:19px;font-weight:700;" +
    "color:var(--chf-text);text-align:center;margin:2px 0 14px}" +
    ".chf-app .chf-file-cta .chf-file-preview img{max-height:41vh;object-fit:contain;" +
    "border-radius:18px;margin:0 0 16px;background:none}" +
    ".chf-app .chf-file-cta .chf-file-clear{margin:0 auto 16px}" +
    // Nar bilden ar vald ar det bilden som ar skarmen. Instruktionen och
    // exempelbilden har gjort sitt och ska inte ligga kvar och konkurrera.
    ".chf-app .chf-step.chf-has-photo .chf-hide-on-photo{display:none}" +

    // Ledtext i Thea-anatomin: brodtext med feta nyckelord, ingen rubrik.
    ".chf-app .chf-lead{font-size:17px;line-height:1.55;color:var(--chf-text);margin:2px 0 16px}" +
    ".chf-app .chf-lead b{font-weight:700}" +
    ".chf-app .chf-bigshot{margin:0 0 16px;position:relative;font-size:0}" +
    ".chf-app .chf-bigshot img{display:block;width:100%;height:auto;max-height:41vh;" +
    "object-fit:cover;border-radius:18px}" +
    ".chf-app .chf-privacy{margin:0;text-align:center;font-size:14px;color:var(--chf-muted)}" +

    // Avslutningen ar en egen skarm i en app, centrerad och lugn - inte ett
    // vansterstallt kvitto dar formularet stod.
    ".chf-app .chf-ending{text-align:center;display:flex;flex-direction:column;" +
    "justify-content:center;flex:1;padding:24px 0 48px}" +
    ".chf-app .chf-ending h2{font-size:26px;color:var(--chf-text);margin:0 0 12px}" +
    ".chf-app .chf-ending p{color:var(--chf-muted);font-size:16px;line-height:1.6}" +
    ".chf-app .chf-endmark{width:72px;height:72px;border-radius:50%;margin:0 auto 20px;" +
    "background:color-mix(in srgb,var(--chf-brand) 12%,#fff);display:flex;align-items:center;" +
    "justify-content:center;animation:chf-pop .32s cubic-bezier(.34,1.56,.64,1) both}" +
    ".chf-app .chf-endmark svg{width:34px;height:34px;color:var(--chf-brand)}" +
    ".chf-app .chf-slots{display:flex;gap:10px;margin:4px 0 22px}" +

    // Tidslinjekurvan. Monstret ar Gruns/FP:s 12-veckors timeline-graf med
    // "Du ar har"-markor (quiz-funnels, renew-quiz-blueprint punkt 138).
    // Kurvan ar KVALITATIV med avsikt: ingen y-skala och inga effektsiffror,
    // for det enda som ar kallbelagt ar NAR saker brukar synas (Kim et al.
    // 2018, Nutrients - fukt vid vecka 6, rynkor och elasticitet vid 12),
    // inte hur mycket. En y-axel med tal hade last som ett utlovat resultat.
    ".chf-app .chf-kurva{background:var(--chf-surface);border:1px solid rgba(50,13,1,.08);" +
    "border-radius:16px;padding:16px 14px 10px;margin:6px 0 4px}" +
    ".chf-app .chf-kurva svg{display:block;width:100%;height:auto}" +
    ".chf-app .chf-kurva-linje{fill:none;stroke:var(--chf-brand);stroke-width:3.5;" +
    "stroke-linecap:round;stroke-dasharray:420;stroke-dashoffset:420;" +
    "animation:chf-rita 1.5s cubic-bezier(.33,.9,.42,1) .15s forwards}" +
    "@keyframes chf-rita{to{stroke-dashoffset:0}}" +
    ".chf-app .chf-kurva-yta{fill:var(--chf-brand);opacity:0;animation:chf-tona .9s ease .85s forwards}" +
    "@keyframes chf-tona{to{opacity:.09}}" +
    ".chf-app .chf-kurva-du{opacity:0;animation:chf-pop .45s cubic-bezier(.34,1.56,.64,1) 1.15s forwards}" +
    "@keyframes chf-pop{from{opacity:0;transform:translateY(6px) scale(.8)}" +
    "to{opacity:1;transform:none}}" +
    ".chf-app .chf-kurva-ring{fill:#fff;stroke:var(--chf-brand);stroke-width:3.5}" +
    ".chf-app .chf-kurva-etikett{font:700 11px inherit;fill:var(--chf-brand);letter-spacing:.4px}" +
    ".chf-app .chf-kurva-rut{stroke:rgba(50,13,1,.09);stroke-width:1}" +
    // Axeln ar SVG-text vid exakta x-lagen, sa "30" star ovanfor dag 30 pa
    // kurvan. En flexrad med space-between la den i mitten av bredden.
    ".chf-app .chf-kurva-axel-txt{font-size:11.5px;font-weight:600;letter-spacing:.3px;" +
    "fill:var(--chf-muted)}" +
    "@media (prefers-reduced-motion:reduce){" +
    ".chf-app .chf-kurva-linje{animation:none;stroke-dashoffset:0}" +
    ".chf-app .chf-kurva-yta{animation:none;opacity:.09}" +
    ".chf-app .chf-kurva-du{animation:none;opacity:1}}" +
    ".chf-app .chf-slot-cell{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px}" +
    ".chf-app .chf-slot-box{width:100%;aspect-ratio:4/5;border-radius:14px;display:flex;" +
    "align-items:center;justify-content:center;overflow:hidden;box-sizing:border-box;" +
    "border:2px dashed rgba(50,13,1,.16);background:color-mix(in srgb,var(--chf-brand) 6%,#fff)}" +
    ".chf-app .chf-slot-box img{width:100%;height:100%;object-fit:cover;display:block}" +
    ".chf-app .chf-slot-box.chf-slot-fylld{border:2px solid var(--chf-brand)}" +
    ".chf-app .chf-slot-box svg{width:24px;height:24px;color:rgba(50,13,1,.22)}" +
    ".chf-app .chf-slot-cap{font-size:12px;font-weight:700;letter-spacing:.6px;" +
    "color:rgba(50,13,1,.38)}" +
    ".chf-app .chf-slot-cap-fylld{color:var(--chf-text)}" +
    // Delningskortet pa tacksidan. Bilden ar serverrenderad, sa den gar att
    // spara och dela som vilken bild som helst - en skarmdump av en CSS-layout
    // hade burit hennes telefons statusrad med sig.
    ".chf-app .chf-delning{margin:18px 0 0}" +
    ".chf-app .chf-delning img{display:block;width:100%;height:auto;max-height:40vh;" +
    "object-fit:contain;border-radius:18px}" +
    ".chf-app .chf-dela{display:flex;align-items:center;justify-content:center;gap:9px;" +
    "width:100%;margin:14px 0 0;min-height:56px;border:0;border-radius:14px;" +
    "background:var(--chf-brand);color:#fff;font:inherit;font-size:17px;font-weight:700;" +
    "cursor:pointer;box-shadow:0 8px 24px rgba(240,87,61,.22)}" +
    ".chf-app .chf-dela:active{transform:scale(.98)}" +
    ".chf-app .chf-dela svg{width:20px;height:20px}" +
    // Valknappar. Den primara ar stor och fylld, den tysta ar en textrad -
    // samma viktning som mobilspelens "Double Reward" mot "Free".
    ".chf-app .chf-choices{display:flex;flex-direction:column;gap:6px}" +
    ".chf-app .chf-field-choice{margin:auto 0 0;display:flex;flex-direction:column;justify-content:flex-end}" +
    ".chf-app .chf-choice{display:flex;flex-direction:column;align-items:center;gap:3px;" +
    "width:100%;border:0;border-radius:14px;padding:17px 20px;font:inherit;cursor:pointer;" +
    "transition:transform .15s}" +
    ".chf-app .chf-choice:active{transform:scale(.98)}" +
    ".chf-app .chf-choice b{font-size:18px;font-weight:800;letter-spacing:.2px}" +
    ".chf-app .chf-choice span{font-size:13.5px;font-weight:500;opacity:.85}" +
    ".chf-app .chf-choice-primary{background:var(--chf-brand);color:#fff;min-height:64px;" +
    "box-shadow:0 10px 28px rgba(240,87,61,.28)}" +
    ".chf-app .chf-choice-quiet{background:none;color:var(--chf-muted);min-height:48px;padding:12px}" +
    ".chf-app .chf-choice-quiet b{font-size:16px;font-weight:600}" +
    "@keyframes chf-pop{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}" +
    "@media (prefers-reduced-motion:reduce){.chf-app .chf-endmark{animation:none}}" +
    ".chf-app .chf-toperror{border-radius:12px}";

  var styleEl = document.createElement("style");
  styleEl.textContent = CSS + APP_CSS;
  document.head.appendChild(styleEl);

  // ------------------------------------------------------------------ utils
  /** Element with plain-text content (safe for any string). */
  function elText(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  /** Element with HTML content - ONLY for trusted first-party form config
   *  (intro, info blocks, endings) authored in our own hub DB. Never pass
   *  user input here. */
  function elHtml(tag, cls, trustedHtml) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    e.innerHTML = trustedHtml;
    return e;
  }
  /** `{{key}}` in an info block is replaced by that field's current answer.
   *  The ångerrätt confirmation step needs it - the customer must see WHICH
   *  order they are withdrawing from before pressing the statutory confirm
   *  button. Values come from customer input, so they are escaped before they
   *  reach innerHTML. An unanswered field renders as an empty string. */
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
  function interpolate(html) {
    return html.replace(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g, function (_m, key) {
      // {{hub}} = hubbens origin. Bilder i hubbens /public maste refereras
      // absolut: embedden kors pa Shopifys sida, dar en relativ sokvag letar
      // hos Shopify och ger 404.
      if (key === "hub") return HUB;
      // Bild-URL:er kommer fran vart eget serieuppslag, inte fran kunden, och
      // ska in i ett src-attribut - escapeHtml hade gjort &amp; av en query.
      if (key === "forra_bild_url" || key === "uppladdad_url" || key === "vald_bild_url" || key === "token" || /^bild_\d_url$/.test(key)) {
        var u = state.values[key];
        return u ? String(u).replace(/"/g, "%22") : "";
      }
      var v = state.values[key];
      if (v === undefined || v === null) return "";
      var f = findField(key);
      // select/radio: show the option label, not the machine value
      if (f && f.options) {
        for (var i = 0; i < f.options.length; i++) {
          if (f.options[i].value === v) return escapeHtml(f.options[i].label);
        }
      }
      return escapeHtml(v);
    });
  }

  /** `{{key}}` -> faltets varde, som ren text. For etiketter och knappar, dar
   *  vardet aldrig ska tolkas som HTML. */
  function fillPlaceholders(text) {
    return String(text).replace(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g, function (_m, key) {
      var v = state.values[key];
      return v === undefined || v === null ? "" : String(v);
    });
  }

  function isEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }
  function conditionMet(cond) {
    if (!cond) return true;
    // all: [...] = alla delvillkor maste halla. Behovs nar ett falt beror pa
    // BADE vilket steg hon ar pa och vad hon svarat - tidslinjens rubrik ska
    // inte kunna dyka upp vid dag 1 bara for att markt-faltet finns i DOM.
    if (cond.all) return cond.all.every(conditionMet);
    var v = state.values[cond.field];
    // `checkboxes` svarar med en ARRAY. Tom array = inget svar, och `in`
    // traffar om NAGOT av valen star i listan - det ar det som gor
    // "Annat -> specificera" mojlig. Spegeln ligger i src/lib/form-utils.ts.
    if (Array.isArray(v)) {
      if (cond.isEmpty) return v.length === 0;
      if (cond.notEmpty) return v.length > 0;
      if (cond.in) {
        for (var mi = 0; mi < v.length; mi++) if (cond.in.indexOf(v[mi]) !== -1) return true;
        return false;
      }
      return true;
    }
    var empty = v === undefined || v === null || v === "" || v === false;
    // isEmpty ar motsatsen till notEmpty och behovs for "visa det har BARA om
    // vi inte redan vet det" - e-postfaltet nar lanken bar en token.
    if (cond.isEmpty) return empty;
    if (cond.notEmpty) return !empty;
    if (cond.in) return !empty && cond.in.indexOf(v) !== -1;
    return true;
  }

  // ------------------------------------------------------------------ render
  /** Dela fälten i steg vid pagebreaks. Returnerar [{fields, continueLabel}] -
   *  continueLabel är pagebreakens label (knappen som lämnar steget). */
  function splitSteps(fields) {
    var steps = [{ fields: [], continueLabel: null }];
    fields.forEach(function (f) {
      if (f.kind === "pagebreak") {
        steps[steps.length - 1].continueLabel = f.label || "Fortsätt";
        steps.push({ fields: [], continueLabel: null });
      } else {
        steps[steps.length - 1].fields.push(f);
      }
    });
    return steps;
  }

  /** Tillbaka pa alla steg utom det forsta. Utan den ar ett felskrivet svar i
   *  ett tidigare steg en atervandsgrand: enda utvagen ar att ladda om och
   *  borja fran borjan. */
  function addBackButton(stepEl, stepIdx) {
    // App-laget har backen som rund knapp i headern i stallet, alltid pa samma
    // plats oavsett hur langt steget ar.
    if (state.app) return;
    if (stepIdx === 0) return;
    var back = elText("button", "chf-back", T.back);
    back.type = "button";
    back.addEventListener("click", function () { showStep(stepIdx - 1); });
    stepEl.appendChild(back);
  }

  /** "Steg 2 av 3" - ett flerstegsformular ska visa var man ar och hur mycket
   *  som aterstar. Utan den vet hon inte om det ar ett steg kvar eller fem. */
  function updateStepIndicator(idx, total) {
    if (state.app) {
      // Rakna bara steg som faktiskt visas. En kund som hoppar over
      // e-poststeget ska se "tre streck", inte fyra dar ett aldrig fylls.
      var els = container.querySelectorAll("[data-step]");
      var synliga = 0, position = 0;
      for (var si = 0; si < els.length; si++) {
        if (!stepHasContent(els[si])) continue;
        synliga++;
        if (si <= idx) position = synliga;
      }
      if (synliga > 0) { total = synliga; idx = Math.max(0, position - 1); }
      var track = container.querySelector(".chf-track");
      var fill = container.querySelector(".chf-fill");
      var hback = container.querySelector(".chf-headback");
      // Ett enstegsformular har ingen resa att visa - da ar en full stapel
      // bara dekoration.
      if (track) track.hidden = total < 2;
      container.classList.toggle("chf-bare", total < 2);
      if (fill) fill.style.width = Math.round(((idx + 1) / total) * 100) + "%";
      // visibility, inte display: knappen ska behalla sin plats sa rubriken
      // under inte hoppar upp 64px mellan steg ett och tva.
      if (hback) hback.hidden = idx === 0;
      return;
    }
    var wrap = container.querySelector(".chf-steps");
    if (!wrap) return;
    if (total < 2) { wrap.style.display = "none"; return; }
    wrap.style.display = "";
    var label = wrap.querySelector(".chf-steps-label");
    var fill = wrap.querySelector(".chf-steps-fill");
    if (label) label.textContent = T.step(idx + 1, total);
    if (fill) fill.style.width = Math.round(((idx + 1) / total) * 100) + "%";
  }

  /** Har steget nagot att visa? Ett steg vars enda falt ar bortvillkorade ska
   *  inte kosta ett klick. Utan det fick en kund som kom via en tokenlank anda
   *  klicka sig forbi en tom e-postskarm. */
  function stepHasContent(el) {
    var barn = el.children;
    for (var i = 0; i < barn.length; i++) {
      var b = barn[i];
      if (b.classList.contains("chf-submit") || b.classList.contains("chf-back") ||
          b.classList.contains("chf-hp")) continue;
      if (b.style.display === "none") continue;
      return true;
    }
    return false;
  }

  /** Nasta steg i riktningen `dir` som faktiskt har innehall. */
  function nextVisibleStep(from, dir) {
    var els = container.querySelectorAll("[data-step]");
    var i = from;
    while (i >= 0 && i < els.length) {
      if (stepHasContent(els[i])) return i;
      i += dir;
    }
    return null;
  }

  /** Skickar in formularet direkt. Behovs nar alla steg efter det aktuella ar
   *  bortvillkorade: da ar det har sista skarmen, och knappen ska skicka in i
   *  stallet for att leda till en tom vy. */
  function skickaInDirekt() {
    var f = container.querySelector(".chf-form");
    if (!f) return;
    var sb = f.querySelector("button.chf-submit[type=submit]");
    var te = f.querySelector(".chf-toperror");
    if (sb && te) onSubmit(f, sb, te);
  }

  function showStep(idx) {
    // Riktningen avgor vilket hall vi letar efter nasta icke-tomma steg: bakat
    // nar hon tryckt tillbaka, annars framat.
    var hittad = nextVisibleStep(idx, idx >= state.currentStep ? 1 : -1);
    idx = hittad === null ? idx : hittad;
    state.currentStep = idx;
    var stepEls = container.querySelectorAll("[data-step]");
    for (var i = 0; i < stepEls.length; i++) {
      stepEls[i].style.display = String(idx) === stepEls[i].getAttribute("data-step") ? "" : "none";
    }
    updateStepIndicator(idx, stepEls.length);
    syncStepButtons();
    if (state.app) {
      // Skarmbyte, inte en rullning inom en sida: hoppa direkt till toppen och
      // spela om inanimationen. Klassen maste tas bort och sattas igen med en
      // reflow emellan, annars kor animationen bara vid forsta renderingen.
      var cur = container.querySelector('[data-step="' + idx + '"]');
      if (cur) {
        cur.classList.remove("chf-in");
        void cur.offsetWidth;
        cur.classList.add("chf-in");
      }
      window.scrollTo(0, 0);
      return;
    }
    container.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** App-lagets skal: header med rund tillbakaknapp, progressbar kant till
   *  kant och en innehallskolumn. Returnerar elementet som formularet ska
   *  monteras i. Byggs bara nar config.theme.mode === "app". */
  function buildAppShell(theme) {
    container.classList.add("chf-app");
    // Temats farger skrivs som variabler pa roten, sa ett formular kan byta
    // palett utan att nagon CSS-regel behover roras.
    var vars = { brand: "--chf-brand", bg: "--chf-bg", surface: "--chf-surface",
                 text: "--chf-text", muted: "--chf-muted" };
    for (var k in vars) {
      if (theme[k]) container.style.setProperty(vars[k], String(theme[k]));
    }

    var head = elText("div", "chf-head");
    var back = elText("button", "chf-headback");
    back.type = "button";
    back.setAttribute("aria-label", T.back);
    back.hidden = true;
    back.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"' +
      ' stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/></svg>';
    back.addEventListener("click", function () {
      var cur = container.querySelector('[data-step="' + state.currentStep + '"]');
      if (cur && cur.__carousel && cur.__carousel.back()) return;
      if (state.currentStep > 0) showStep(state.currentStep - 1);
    });
    head.appendChild(back);
    // Varumarket ska synas pa varje skarm, inte bara i mailen. Kunden kommer hit
    // fran en QR-kod pa ett kort och behover se VEM som fragar efter hennes
    // ansiktsbilder.
    if (theme.logo) {
      var logga = elText("div", "chf-logo");
      var limg = document.createElement("img");
      limg.src = String(theme.logo).replace("{{hub}}", HUB);
      limg.alt = "";
      logga.appendChild(limg);
      head.appendChild(logga);
    }
    container.appendChild(head);

    var track = elText("div", "chf-track");
    track.appendChild(elText("div", "chf-fill"));
    container.appendChild(track);

    var body = elText("div", "chf-body");
    container.appendChild(body);

    // Tangentbordsdetektering. visualViewport krymper nar tangentbordet
    // oppnas medan window.innerHeight star stilla, sa skillnaden ar
    // tangentbordets hojd. 140 px skiljer ett tangentbord fran adressfaltets
    // egna in- och utglidning, som ar ca 60-90 px och inte ska rakna.
    if (window.visualViewport) {
      var vv = window.visualViewport;
      var onViewport = function () {
        container.classList.toggle("chf-kb", window.innerHeight - vv.height > 140);
      };
      vv.addEventListener("resize", onViewport);
      onViewport();
    }
    return body;
  }

  /** Oppnar ett overlagg med en bild. Utlosas av valfritt element med
   *  data-chf-guide i formularets egen HTML, sa en guide kan laggas dar den
   *  behovs utan att kosta ett steg.
   *
   *  Ligger pa document.body och inte i containern: embedden kan sitta i en
   *  smal kolumn med overflow, och da hade overlagget klippts av sin egen
   *  foralder. */
  function openGuide(src, rubrik, text) {
    var back = elText("div", "chf-modal");
    var box = elText("div", "chf-modal-box");
    if (rubrik) box.appendChild(elText("h3", null, rubrik));
    if (text) box.appendChild(elText("p", null, text));
    var img = document.createElement("img");
    img.src = src;
    img.alt = rubrik || "Exempel";
    box.appendChild(img);
    var stang = elText("button", "chf-modal-close", T.close);
    stang.type = "button";
    box.appendChild(stang);
    back.appendChild(box);

    function close() {
      if (back.parentNode) back.parentNode.removeChild(back);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = tidigareOverflow;
    }
    function onKey(e) { if (e.key === "Escape") close(); }
    stang.addEventListener("click", close);
    back.addEventListener("click", function (e) { if (e.target === back) close(); });
    document.addEventListener("keydown", onKey);

    // Temats variabler bor pa .chf-root. Overlagget ligger pa body och arver
    // dem darfor inte - Stang-knappen blev svart i stallet for brandfargad.
    // Kopiera over dem i stallet for att hardkoda en farg har.
    ["--chf-brand", "--chf-bg", "--chf-surface", "--chf-text", "--chf-muted"].forEach(function (v) {
      var varde = container.style.getPropertyValue(v);
      if (varde) back.style.setProperty(v, varde);
    });

    var tidigareOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.appendChild(back);
    stang.focus();
  }

  container.addEventListener("click", function (e) {
    var delaBtn = e.target.closest && e.target.closest("[data-chf-dela]");
    if (delaBtn) {
      e.preventDefault();
      var url = delaBtn.getAttribute("data-chf-dela");
      delaBtn.disabled = true;
      fetch(url)
        .then(function (r) { return r.blob(); })
        .then(function (blob) {
          var fil = new File([blob], "min-envana-resa.jpg", { type: blob.type || "image/jpeg" });
          if (navigator.share && navigator.canShare && navigator.canShare({ files: [fil] })) {
            return navigator.share({ files: [fil] });
          }
          // Utan systemdelning: oppna bilden i en egen flik sa hon kan spara
          // den. En <a download> ar blockerad i flera inbaddade lagen.
          window.open(URL.createObjectURL(blob), "_blank");
        })
        .catch(function () {})
        .then(function () { delaBtn.disabled = false; });
      return;
    }
    var trigger = e.target.closest && e.target.closest("[data-chf-guide]");
    if (!trigger) return;
    e.preventDefault();
    openGuide(
      trigger.getAttribute("data-chf-guide"),
      trigger.getAttribute("data-chf-guide-title") || "",
      trigger.getAttribute("data-chf-guide-text") || ""
    );
  });

  /** Gor ett steg med .chf-carousel till en karusell: ritar prickar, visar en
   *  panel i taget och later stegets EGEN knapp ga vidare panel for panel
   *  innan den lamnar steget.
   *
   *  Knappen ar stegets, inte karusellens - det ar det som gor att den star
   *  still medan innehallet vaxlar. */
  function wireCarousel(stepEl) {
    var wrap = stepEl.querySelector(".chf-carousel");
    if (!wrap) return null;
    var paneler = wrap.querySelectorAll(".chf-panel");
    if (paneler.length < 2) return null;

    var dots = elText("div", "chf-dots");
    for (var i = 0; i < paneler.length; i++) dots.appendChild(elText("div", "chf-dot"));
    wrap.appendChild(dots);

    var nu = 0;
    function visa(idx) {
      nu = Math.max(0, Math.min(paneler.length - 1, idx));
      for (var j = 0; j < paneler.length; j++) {
        paneler[j].classList.toggle("chf-panel-on", j === nu);
        dots.children[j].classList.toggle("chf-dot-on", j === nu);
      }
    }
    visa(0);

    // Swajp. Utan den ser prickarna ut som att man kan dra, och det forsta man
    // provar nar man ser prickar ar att dra.
    var x0 = null;
    wrap.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    wrap.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) < 45) return;
      visa(nu + (dx < 0 ? 1 : -1));
    }, { passive: true });

    return {
      /** Sant om knappen konsumerades av karusellen (det fanns en panel kvar). */
      advance: function () {
        if (nu >= paneler.length - 1) return false;
        visa(nu + 1);
        return true;
      },
      back: function () {
        if (nu <= 0) return false;
        visa(nu - 1);
        return true;
      },
    };
  }

  function render() {
    container.innerHTML = "";
    container.classList.remove("chf-app");
    var cfg = state.config;
    var theme = cfg.theme || {};
    state.app = theme.mode === "app";

    var mount = state.app ? buildAppShell(theme) : container;

    if (cfg.title) mount.appendChild(elText("h2", "chf-title", cfg.title));
    if (cfg.intro) mount.appendChild(elHtml("div", "chf-intro", cfg.intro));

    if (!state.app) {
      var stepsBar = elText("div", "chf-steps");
      stepsBar.appendChild(elText("span", "chf-steps-label", ""));
      var track0 = elText("div", "chf-steps-track");
      track0.appendChild(elText("div", "chf-steps-fill"));
      stepsBar.appendChild(track0);
      mount.appendChild(stepsBar);
    }

    var form = elText("form", "chf-form");
    form.setAttribute("novalidate", "novalidate");

    var topError = elText("div", "chf-toperror");
    form.appendChild(topError);

    var steps = splitSteps(cfg.fields);

    steps.forEach(function (step, stepIdx) {
      var stepEl = elText("div", "chf-step");
      stepEl.setAttribute("data-step", String(stepIdx));
      if (stepIdx === 0) stepEl.classList.add("chf-in");
      if (stepIdx !== 0) stepEl.style.display = "none";

      // Single select: klicket ar sjalva svaret och darmed ocksa stegets
      // handling. En Fortsatt-knapp under alternativen blir en andra vag ur
      // skarmen och ett extra tryck utan innehall. Multi select behaller sin
      // CTA - dar ar ett klick inte ett avslut.
      //
      // Raknar SYNLIGA falt, eftersom ett steg kan bara flera radios som
      // utesluter varandra pa showWhen (fragan skiljer sig mellan bild 1 och
      // bild 2/3). Synligheten las vid bygget, vilket racker sa lange inget
      // falt i SAMMA steg styr ett annat faltts showWhen.
      var synliga = step.fields.filter(function (f) {
        if (f.kind === "info" || f.kind === "hidden") return false;
        return !f.showWhen || conditionMet(f.showWhen);
      });
      var autoRadio = synliga.length === 1 && synliga[0].kind === "radio" ? synliga[0] : null;
      step.fields.forEach(function (f) { f.__auto = f === autoRadio; });

      step.fields.forEach(function (f) {
        var wrap;
        if (f.kind === "info") {
          wrap = elHtml("div", "chf-info", interpolate(f.html));
          if (/\{\{/.test(f.html)) wrap.setAttribute("data-tpl", "1");
        } else {
          wrap = elText("div", "chf-field");
          if (f.label && f.kind !== "checkbox") {
            var lab = elText("label", "chf-label", f.label);
            // Markera det VALFRIA, inte det obligatoriska. Nar nastan alla
            // falt kravs blir asterisker bara rott brus som signalerar krav.
            if (!f.required) lab.appendChild(elText("span", "chf-optional", T.optional));
            lab.setAttribute("for", "chf-" + f.key);
            wrap.appendChild(lab);
          }
          if (f.help) wrap.appendChild(elText("div", "chf-help", f.help));
          wrap.appendChild(buildInput(f));
          wrap.appendChild(elText("div", "chf-error", ""));
        }
        if (f.kind === "choice") wrap.classList.add("chf-field-choice");
        wrap.setAttribute("data-key", f.key);
        if (f.kind === "hidden") wrap.style.display = "none";
        if (f.showWhen) {
          wrap.setAttribute("data-showwhen", "1");
          if (!conditionMet(f.showWhen)) wrap.style.display = "none";
        }
        stepEl.appendChild(wrap);
      });

      // Steg vars CTA ska oppna filvaljaren i stallet for att ga vidare, sa
      // lange ingen bild ar vald. Etiketten byts i syncStepButtons().
      var ctaFalt = null;
      step.fields.forEach(function (f) {
        if (f.kind === "file" && f.asCta) ctaFalt = f;
      });
      stepEl.__ctaFalt = ctaFalt;

      /** Tomt lage: knappen ar en oppna-valjaren-knapp, inte en ga-vidare. */
      function ctaVantarPaBild() {
        return !!ctaFalt && !(state.files[ctaFalt.key] || []).length;
      }
      function oppnaValjaren() {
        var inp = stepEl.querySelector('[data-key="' + ctaFalt.key + '"] input[type=file]');
        if (inp) inp.click();
      }
      if (ctaFalt) {
        // Allt i steget som ser ut som en tryckyta for bilden (platshallar-
        // rutan, en ruta i serien) oppnar samma valjare. Utan detta ser rutan
        // tryckbar ut men gor ingenting, vilket ar varre an ingen ruta alls.
        stepEl.addEventListener("click", function (ev) {
          var t = ev.target && ev.target.closest ? ev.target.closest("[data-chf-pick]") : null;
          if (t) { ev.preventDefault(); oppnaValjaren(); }
        });
      }

      // Ett steg med valknappar har redan sin handling. En CTA under dem hade
      // varit en tredje vag ur skarmen, och den vagen finns inte.
      var harVal = !!autoRadio || step.fields.some(function (f) { return f.kind === "choice"; });
      if (harVal) {
        stepEl.__carousel = wireCarousel(stepEl);
        form.appendChild(stepEl);
        return;
      }
      if (stepIdx < steps.length - 1) {
        // Mellansteg: Fortsätt-knapp som validerar stegets synliga fält
        var cont = elText("button", "chf-submit", step.continueLabel || T.continue);
        cont.type = "button";
        stepEl.__ctaKlarLabel = step.continueLabel || T.continue;
        cont.addEventListener("click", function () {
          // Karusellen ager knappen tills sista panelen ar visad.
          if (stepEl.__carousel && stepEl.__carousel.advance()) return;
          if (ctaVantarPaBild()) { oppnaValjaren(); return; }
          topError.style.display = "none";
          if (!validate(form, step.fields)) {
            var firstInvalid = stepEl.querySelector(".chf-invalid");
            if (firstInvalid) firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
          }
          var nasta = nextVisibleStep(stepIdx + 1, 1);
          if (nasta === null) { skickaInDirekt(); return; }
          showStep(nasta);
        });
        stepEl.appendChild(cont);
        addBackButton(stepEl, stepIdx);
      } else {
        // Sista steget: honeypot + submit
        var hp = elText("div", "chf-hp");
        var hpLabel = elText("label", null, T.honeypot);
        var hpInput = document.createElement("input");
        hpInput.type = "text";
        hpInput.name = "website";
        hpInput.tabIndex = -1;
        hpInput.autocomplete = "off";
        hpLabel.appendChild(hpInput);
        hp.appendChild(hpLabel);
        stepEl.appendChild(hp);

        // Knappetiketten far bara stegets nummer: "Ladda upp bild {{steg}} av 3".
        // Thea-monstret ur matningen - rakningen ligger i knappen hon faktiskt
        // trycker pa, inte nagon annanstans pa skarmen.
        //
        // Ren textersattning, inte interpolate(): etiketten ar TEXT och satts
        // med textContent, sa den ska varken escapas eller tolkas som HTML.
        var submit = elText("button", "chf-submit", fillPlaceholders(cfg.submitLabel || T.submit));
        submit.type = "submit";
        stepEl.__ctaKlarLabel = fillPlaceholders(cfg.submitLabel || T.submit);
        stepEl.appendChild(submit);
        addBackButton(stepEl, stepIdx);

        form.addEventListener("submit", function (ev) {
          ev.preventDefault();
          // Ligger bilden pa sista steget ar samma knapp bade "ta bild" och
          // "skicka in" - den far inte skicka in en tom inskickning.
          if (ctaVantarPaBild()) { oppnaValjaren(); return; }
          onSubmit(form, submit, topError);
        });
      }

      stepEl.__carousel = wireCarousel(stepEl);
      form.appendChild(stepEl);
    });

    mount.appendChild(form);
    syncSubmitVisibility();
    syncStepButtons();
    // Hoppa fram till forsta steget som faktiskt HAR innehall. render() visade
    // alltid steg 0, och for en kund som kom via tokenlank var steg 0
    // bortvillkorat - hon motte en tom skarm med bara en knapp pa.
    var forsta = nextVisibleStep(0, 1);
    if (forsta === null) forsta = 0;
    if (forsta !== 0) {
      showStep(forsta);
    } else {
      // Indikatorn maste sattas aven nar vi inte byter steg - showStep() kors
      // bara vid stegbyte, sa utan detta var den tom tills forsta klicket.
      updateStepIndicator(0, steps.length);
    }
  }

  function buildInput(f) {
    var id = "chf-" + f.key;
    if (f.kind === "hidden") {
      var hid = document.createElement("input");
      hid.type = "hidden";
      hid.id = id;
      hid.value = state.values[f.key] || "";
      return hid;
    }
    if (f.kind === "textarea") {
      var ta = elText("textarea", "chf-textarea");
      ta.id = id;
      if (f.placeholder) ta.placeholder = f.placeholder;
      if (state.values[f.key] !== undefined) ta.value = String(state.values[f.key]);
      ta.addEventListener("input", function () { setValue(f.key, ta.value); });
      return ta;
    }
    if (f.kind === "select") {
      var sel = elText("select", "chf-select");
      sel.id = id;
      var ph = elText("option", null, f.placeholder || T.choose);
      ph.value = "";
      sel.appendChild(ph);
      f.options.forEach(function (o) {
        var opt = elText("option", null, o.label);
        opt.value = o.value;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", function () { setValue(f.key, sel.value); });
      return sel;
    }
    if (f.kind === "radio") {
      var group = elText("div", "chf-radio-group");
      f.options.forEach(function (o) {
        var lab = elText("label", "chf-radio");
        var inp = document.createElement("input");
        inp.type = "radio";
        inp.name = id;
        inp.value = o.value;
        inp.addEventListener("change", function () {
          if (!inp.checked) return;
          setValue(f.key, o.value);
          if (!f.__auto) return;
          // Kort paus sa hon HINNER se att hennes val markerades. Utan den
          // byts skarmen i samma ogonblick som fingret lyfts och valet
          // bekraftas aldrig visuellt.
          setTimeout(function () {
            var steg = group.closest("[data-step]");
            var idx = steg ? parseInt(steg.getAttribute("data-step"), 10) : state.currentStep;
            var nasta = nextVisibleStep(idx + 1, 1);
            if (nasta === null) skickaInDirekt(); else showStep(nasta);
          }, 200);
        });
        lab.appendChild(inp);
        lab.appendChild(elText("span", null, o.label));
        group.appendChild(lab);
      });
      return group;
    }
    // Flerval. Vardet ar en ARRAY av valda values - sa formatAnswerValue pa
    // servern skriver dem som "Battre hud, Starkare naglar" i ticketen, och
    // showWhen/`in` traffar om NAGOT av valen star i listan.
    //
    // Ser ut som radiogruppen med flit: samma ruta, samma tryckyta. Det enda
    // som skiljer ar den fyrkantiga rutan och att flera kan vara ifyllda.
    if (f.kind === "checkboxes") {
      var mgroup = elText("div", "chf-radio-group");
      f.options.forEach(function (o) {
        var mlab = elText("label", "chf-radio chf-multi");
        var minp = document.createElement("input");
        minp.type = "checkbox";
        minp.name = id;
        minp.value = o.value;
        minp.addEventListener("change", function () {
          var valda = Array.isArray(state.values[f.key]) ? state.values[f.key].slice() : [];
          var pos = valda.indexOf(o.value);
          if (minp.checked && pos === -1) valda.push(o.value);
          if (!minp.checked && pos !== -1) valda.splice(pos, 1);
          // Tom array ar inget svar - satt "" sa required-kollen och
          // conditionMet behandlar den som tomt, precis som ett tomt textfalt.
          setValue(f.key, valda.length ? valda : "");
        });
        mlab.appendChild(minp);
        mlab.appendChild(elText("span", null, o.label));
        mgroup.appendChild(mlab);
      });
      return mgroup;
    }
    if (f.kind === "checkbox") {
      var clab = elText("label", "chf-check");
      var cinp = document.createElement("input");
      cinp.type = "checkbox";
      cinp.id = id;
      cinp.addEventListener("change", function () { setValue(f.key, cinp.checked); });
      clab.appendChild(cinp);
      var ctext = elText("span");
      if (f.label) ctext.appendChild(elText("div", "chf-check-title", f.label));
      if (f.text) ctext.appendChild(elText("div", null, f.text));
      clab.appendChild(ctext);
      return clab;
    }
    if (f.kind === "choice") {
      var cwrap = elText("div", "chf-choices");
      (f.options || []).forEach(function (o) {
        var knapp = elText("button", "chf-choice chf-choice-" + (o.style || "primary"));
        knapp.type = "button";
        knapp.appendChild(elText("b", null, o.label));
        if (o.sub) knapp.appendChild(elText("span", null, o.sub));
        knapp.addEventListener("click", function () {
          setValue(f.key, o.value);
          // Knappen ar stegets handling: satt vardet och ga vidare direkt.
          var steg = cwrap.closest("[data-step]");
          var idx = steg ? parseInt(steg.getAttribute("data-step"), 10) : state.currentStep;
          var nasta = nextVisibleStep(idx + 1, 1);
          if (nasta === null) skickaInDirekt(); else showStep(nasta);
        });
        cwrap.appendChild(knapp);
      });
      return cwrap;
    }
    if (f.kind === "file") {
      // asCta: stegets egen CTA oppnar valjaren. Da ska filfaltet inte rita
      // nagon knapp alls - bara den dolda inputen och forhandsvisningen.
      var asCta = !!f.asCta;
      var fwrap = elText("div", asCta ? "chf-file chf-file-cta" : "chf-file");
      var finp = document.createElement("input");
      finp.type = "file";
      finp.id = id;
      finp.accept = f.accept || "image/*,.pdf";
      if ((f.maxFiles || 1) > 1) finp.multiple = true;

      // Tomt lage: ikon + uppmaning. Hela rutan ar tryckyta via den
      // genomskinliga inputen som ligger over den (se .chf-file i CSS).
      var idle = elText("div", "chf-file-idle");
      var svgNS = "http://www.w3.org/2000/svg";
      var svg = document.createElementNS(svgNS, "svg");
      svg.setAttribute("class", "chf-file-icon");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "1.6");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      [
        "M3 7.5A1.5 1.5 0 0 1 4.5 6h2.6l1.2-1.8A1.5 1.5 0 0 1 9.55 3.5h4.9a1.5 1.5 0 0 1 1.25.7L16.9 6h2.6A1.5 1.5 0 0 1 21 7.5v10A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z",
        "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
      ].forEach(function (d) {
        var path = document.createElementNS(svgNS, "path");
        path.setAttribute("d", d);
        svg.appendChild(path);
      });
      idle.appendChild(svg);
      idle.appendChild(elText("div", "chf-file-main", f.placeholder || T.pickImage));
      idle.appendChild(elText("div", "chf-file-sub", T.pickImageSub));

      // Valt lage: miniatyr sa hon ser VILKEN bild hon valde, inte bara
      // filnamnet. Hon har ofta tre snarlika selfies i rullen.
      var chosen = elText("div", "chf-file-preview");
      chosen.style.display = "none";

      /** Markerar steget nar en bild ar vald, sa allt som bara galler det tomma
       *  laget (ledtext, exempelbild) kan doljas med `chf-hide-on-photo`. */
      function markStep(harBild) {
        var st = fwrap.closest ? fwrap.closest("[data-step]") : null;
        if (st) st.classList.toggle("chf-has-photo", harBild);
      }

      function render(list) {
        if (!list.length) {
          idle.style.display = "";
          chosen.style.display = "none";
          fwrap.classList.remove("chf-has-file");
          markStep(false);
          return;
        }
        idle.style.display = "none";
        if (!asCta) fwrap.classList.add("chf-has-file");
        markStep(true);
        if (list[0] && /^image\//.test(list[0].type)) {
          if (state.values.vald_bild_url) URL.revokeObjectURL(state.values.vald_bild_url);
          state.values.vald_bild_url = URL.createObjectURL(list[0]);
        }
        chosen.replaceChildren();
        // I CTA-lage ar bilden hela skarmen, sa fragan star OVANFOR den och
        // inte under: hon laser "Ser den bra ut?" och tittar sedan.
        if (asCta) chosen.appendChild(elText("div", "chf-file-title", T.looksGood));
        var file = list[0];
        if (/^image\//.test(file.type)) {
          var img = document.createElement("img");
          img.alt = "";
          img.src = URL.createObjectURL(file);
          img.addEventListener("load", function () { URL.revokeObjectURL(img.src); });
          chosen.appendChild(img);
        }
        var meta = elText("div", "chf-file-name");
        // "Ser den bra ut?" i stallet for filnamnet. Monstret ar Turos
        // Use/Retake (Mobbin): efter tagningen far hon FRAGAN, inte en
        // bekraftelse pa vad filen heter. Filnamnet sager henne ingenting -
        // hon har tre snarlika selfies i rullen och behover se VILKEN hon
        // valde och fa en chans att ta om.
        if (!asCta) meta.appendChild(elText("div", "chf-file-main", T.looksGood));

        // Angra. Hela rutan ar en tryckyta som oppnar filvaljaren igen, sa
        // "byt bild" gick redan. Det som INTE gick var att backa ur helt -
        // valde hon fel bild satt den kvar tills hon valde en annan, och det
        // finns inget "ingen bild" att valja i en filvaljare. Knappen maste
        // ligga OVANPA filinputen (som tacker hela rutan) och stoppa klicket
        // fran att bubbla, annars oppnas valjaren i stallet for att rensa.
        var clear = elText("button", "chf-file-clear", T.retake);
        clear.type = "button";
        clear.setAttribute("aria-label", T.retakeAria);
        clear.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          finp.value = "";
          take(null);
        });
        meta.appendChild(clear);

        chosen.appendChild(meta);
        chosen.style.display = "flex";
      }

      function take(files) {
        var list = Array.prototype.slice.call(files || []).slice(0, f.maxFiles || 3);
        state.files[f.key] = list;
        setValue(f.key, list.map(function (x) { return x.name; }).join(", "));
        render(list);
      }

      finp.addEventListener("change", function () { take(finp.files); });

      // Drag and drop pa desktop - labeln lovar det, sa den ska funka.
      ["dragenter", "dragover"].forEach(function (ev) {
        fwrap.addEventListener(ev, function (e) {
          e.preventDefault();
          fwrap.classList.add("chf-file-over");
        });
      });
      ["dragleave", "drop"].forEach(function (ev) {
        fwrap.addEventListener(ev, function (e) {
          e.preventDefault();
          fwrap.classList.remove("chf-file-over");
          if (ev === "drop" && e.dataTransfer && e.dataTransfer.files) take(e.dataTransfer.files);
        });
      });

      if (!asCta) fwrap.appendChild(idle);
      fwrap.appendChild(chosen);
      fwrap.appendChild(finp);
      return fwrap;
    }
    // text / email / date
    var inp2 = document.createElement("input");
    inp2.className = "chf-input";
    inp2.id = id;
    inp2.type = f.kind === "email" ? "email" : f.kind === "date" ? "date" : "text";
    if (state.values[f.key] !== undefined) inp2.value = String(state.values[f.key]);
    if (f.placeholder) inp2.placeholder = f.placeholder;
    if (f.kind === "email") inp2.autocomplete = "email";
    inp2.addEventListener("input", function () { setValue(f.key, inp2.value); });
    return inp2;
  }

  function setValue(key, value) {
    state.values[key] = value;
    // Knappens dampning maste folja med varje andring, annars star den kvar
    // som vantande efter att faltet fyllts i.
    setTimeout(syncStepButtons, 0);
    // Re-evaluate conditional visibility
    var nodes = container.querySelectorAll('[data-showwhen="1"]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var f = findField(node.getAttribute("data-key"));
      if (f && f.showWhen) node.style.display = conditionMet(f.showWhen) ? "" : "none";
    }
    var tpls = container.querySelectorAll('[data-tpl="1"]');
    for (var t = 0; t < tpls.length; t++) {
      var tf = findField(tpls[t].getAttribute("data-key"));
      if (!tf || !tf.html) continue;
      var nyHtml = interpolate(tf.html);
      // Jamfor INNAN skrivning. Utan den har raden byter varje klick ut
      // markupen aven nar den ar identisk, och bilderna hamtas om fran natet.
      if (tpls[t].innerHTML !== nyHtml) tpls[t].innerHTML = nyHtml;
    }
    syncSubmitVisibility();
  }

  /** Hide the submit button while the form cannot produce a deliverable ticket.
   *  The invariant is the e-mail address: delivery marks a submission failed
   *  (and fires a critical alert) when there is none. Kontaktformulärets ämnen
   *  "retur" och "prenumeration" hide every contact field and only point
   *  elsewhere - Fillout hid the button there too, and without this a customer
   *  can post a ticket carrying nothing but the topic.
   *
   *  Counting visible fields does NOT work: the select that drives the
   *  condition is itself a visible field. Evaluated across the whole form, not
   *  per step, since a multi-step form keeps e-mail on an earlier step than
   *  its submit button. */
  /** Dampar stegets knapp tills stegets obligatoriska falt ar ifyllda.
   *
   *  Skarmen "ta bilden" hade tva FYLLDA knappar i brandfargen samtidigt -
   *  "Valj en bild" och "Fortsatt" - och de konkurrerade om blicken. Nu finns
   *  en aktiv handling i taget. Knappen ar inte disabled: den gar att trycka
   *  pa och ger da samma valideringsfel som forut, sa ingen kan fastna utan
   *  att forsta varfor. */
  function syncStepButtons() {
    var stepEls = container.querySelectorAll("[data-step]");
    for (var i = 0; i < stepEls.length; i++) {
      var el = stepEls[i];
      var knapp = el.querySelector(".chf-submit");
      if (!knapp) continue;
      // CTA-lage: knappen har tva jobb. Utan bild heter den "Ta bild" och
      // oppnar valjaren, och da ar den INTE vantande - att trycka pa den ar
      // precis vad hon ska gora. Med bild byter den tillbaka till stegets
      // vanliga etikett och vanlig dampning galler igen.
      var cf = el.__ctaFalt;
      if (cf) {
        var harBild = (state.files[cf.key] || []).length > 0;
        knapp.textContent = harBild
          ? el.__ctaKlarLabel || "Fortsätt"
          : cf.ctaLabel || "Ta bild";
        knapp.classList.remove("chf-submit-vantar");
        if (!harBild) continue;
      }
      var klar = true;
      var wraps = el.querySelectorAll("[data-key]");
      for (var j = 0; j < wraps.length; j++) {
        var w = wraps[j];
        if (w.style.display === "none") continue;
        var f = findField(w.getAttribute("data-key"));
        if (!f || !f.required) continue;
        if (f.kind === "file") {
          var lista = state.files[f.key] || [];
          if (!lista.length) klar = false;
        } else {
          var v = state.values[f.key];
          if (v === undefined || v === null || v === "" || v === false) klar = false;
        }
      }
      knapp.classList.toggle("chf-submit-vantar", !klar);
    }
  }

  function syncSubmitVisibility() {
    var fields = state.config.fields || [];
    var emailField = null;
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].role === "email") { emailField = fields[i]; break; }
    }
    // No e-mail field at all: leave the button alone and let the server judge.
    //
    // Tredje ledet ar tokenlanken. Kommer hon fran ett mail ar e-postfaltet
    // bortvillkorat (`kund` ar satt), och da doldes skicka-knappen - alltsa
    // gick dag 30 och dag 60 inte att skicka in over huvud taget. Adressen
    // FINNS, den ligger bara i ett annat falt. Uppmatt i vyn 2026-09-15:
    // button[type=submit] hade display:none pa hela tokenflodet.
    var deliverable =
      !emailField ||
      !emailField.showWhen ||
      conditionMet(emailField.showWhen) ||
      adressIAnnatFalt(emailField);
    var btns = container.querySelectorAll(".chf-submit");
    for (var j = 0; j < btns.length; j++) {
      if (btns[j].type === "submit") btns[j].style.display = deliverable ? "" : "none";
    }
  }

  /** Bar nagot ANNAT falt som faktiskt skickas in en e-postadress? Speglar
   *  serverns extractEmail, som letar i alla svar och inte bara i faltet med
   *  role "email". Falt vars showWhen inte stammer samlas aldrig in
   *  (collectAnswers hoppar over dem) och raknas darfor inte. */
  function adressIAnnatFalt(emailField) {
    var fields = state.config.fields || [];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f === emailField || f.kind === "info" || f.kind === "pagebreak") continue;
      if (f.showWhen && !conditionMet(f.showWhen)) continue;
      var v = state.values[f.key];
      if (v !== undefined && v !== null && isEmail(String(v))) return true;
    }
    return false;
  }

  function findField(key) {
    for (var i = 0; i < state.config.fields.length; i++) {
      if (state.config.fields[i].key === key) return state.config.fields[i];
    }
    return null;
  }

  // ---------------------------------------------------------------- validate
  function validate(form, fieldsSubset) {
    var ok = true;
    (fieldsSubset || state.config.fields).forEach(function (f) {
      if (f.kind === "info" || f.kind === "pagebreak") return;
      var wrap = form.querySelector('[data-key="' + f.key + '"]');
      if (!wrap) return;
      wrap.classList.remove("chf-invalid");
      if (f.showWhen && !conditionMet(f.showWhen)) return;

      var v = state.values[f.key];
      var errEl = wrap.querySelector(".chf-error");
      var msg = "";
      if (f.required && (v === undefined || v === null || v === "" || v === false)) {
        msg = T.required;
      } else if (f.kind === "email" && v && !isEmail(String(v))) {
        msg = T.badEmail;
      }
      if (msg) {
        ok = false;
        wrap.classList.add("chf-invalid");
        if (errEl) errEl.textContent = msg;
      }
    });
    return ok;
  }

  /** Forifyller falt fran query-strangen pa varden-sidan: `fromParam: "e"` plus
   *  lanken `?e=anna@exempel.se` fyller faltet at kunden. Kors en gang, innan
   *  forsta render, sa att vardet finns i state nar faltet byggs. Galler alla
   *  falttyper - for `hidden` ar det enda vagen in, for synliga falt en genvag
   *  som kunden fortfarande kan andra. */
  function applyParamDefaults() {
    if (!state.config || !state.config.fields) return;
    var qs = null;
    try { qs = new URLSearchParams(window.location.search); } catch (e) { qs = null; }
    state.config.fields.forEach(function (f) {
      if (!f.fromParam && f.kind !== "hidden") return;
      var v = qs && f.fromParam ? qs.get(f.fromParam) : null;
      if (v === null || v === "") v = f.fallback || "";
      if (v === "") return;
      state.values[f.key] = String(v).slice(0, 200);
    });
  }

  // ------------------------------------------------------------------ submit
  function collectAnswers() {
    var answers = [];
    state.config.fields.forEach(function (f) {
      if (f.kind === "info" || f.kind === "pagebreak") return;
      if (f.showWhen && !conditionMet(f.showWhen)) return;
      var v = state.values[f.key];
      if (v === undefined) v = "";
      var answer = { key: f.key, label: f.label || f.key, value: v };
      // Select/radio: skicka med läsbara option-labeln (kunden/CS ska se
      // "Hantera min prenumeration", inte "pren_hantera")
      if ((f.kind === "select" || f.kind === "radio") && f.options) {
        for (var i = 0; i < f.options.length; i++) {
          if (f.options[i].value === v) { answer.display = f.options[i].label; break; }
        }
      }
      // Flerval: samma sak fast flera. Utan det star "hud, naglar" i ticketen
      // i stallet for "Battre hud (fasthet, elasticitet), Starkare naglar".
      if (f.kind === "checkboxes" && f.options && Array.isArray(v)) {
        var etiketter = [];
        for (var mj = 0; mj < v.length; mj++) {
          for (var mk = 0; mk < f.options.length; mk++) {
            if (f.options[mk].value === v[mj]) { etiketter.push(f.options[mk].label); break; }
          }
        }
        if (etiketter.length) answer.display = etiketter.join(", ");
      }
      answers.push(answer);
    });
    return answers;
  }

  function uploadFiles() {
    var uploads = [];
    Object.keys(state.files).forEach(function (key) {
      (state.files[key] || []).forEach(function (file) {
        var fd = new FormData();
        fd.append("file", file);
        // Marknaden med, sa filfel (for stor, fel typ) kommer tillbaka pa
        // kundens sprak i stallet for pa svenska.
        fd.append("market", MARKET);
        uploads.push(
          fetch(HUB + "/api/forms/upload", { method: "POST", body: fd })
            .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
            .then(function (res) {
              if (!res.r.ok || !res.j.url) throw new Error(res.j.error || T.genericError);
              return { url: res.j.url, filename: res.j.filename || file.name, fieldKey: key };
            })
        );
      });
    });
    return Promise.all(uploads);
  }

  function showTopError(topError, msg) {
    topError.textContent = msg;
    topError.style.display = "block";
    topError.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function onSubmit(form, submitBtn, topError) {
    if (state.submitting) return;
    topError.style.display = "none";
    if (!validate(form)) {
      var firstInvalid = form.querySelector(".chf-invalid");
      if (firstInvalid) firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    state.submitting = true;
    submitBtn.disabled = true;
    var originalLabel = submitBtn.textContent;
    submitBtn.textContent = T.sending;

    var hpInput = form.querySelector('input[name="website"]');

    uploadFiles()
      .then(function (files) {
        // Spara bildens URL sa kvittensskarmen kan visa hennes EGEN bild i
        // stallet for en generisk bock. Den ar redan uppladdad har.
        if (files && files[0] && files[0].url) state.values.uppladdad_url = files[0].url;
        return fetch(HUB + "/api/forms/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workspace: WORKSPACE,
            slug: FORM_SLUG,
            market: MARKET,
            clientSubmissionId: clientSubmissionId,
            answers: collectAnswers(),
            files: files,
            isTest: IS_TEST,
            website: hpInput ? hpInput.value : "",
          }),
        }).then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); });
      })
      .then(function (res) {
        if (!res.r.ok) throw new Error(res.j.error || T.genericError);
        showEnding(res.j.gate);
      })
      .catch(function (err) {
        state.submitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
        showTopError(topError, (err && err.message) || T.networkError);
      });
  }

  function showEnding(gate) {
    var endings = state.config.endings || {};
    var ending = (gate && endings[gate]) || endings.success || { title: "Tack!" };
    // Villkorad avslutning: forsta variant vars showWhen stammer vinner. Ett
    // formular som bar flera tillfallen (progressbild ?steg=1|2|3) maste kunna
    // saga olika saker nar serien fortsatter och nar den ar slut.
    if (ending.variants && ending.variants.length) {
      for (var vi = 0; vi < ending.variants.length; vi++) {
        var v = ending.variants[vi];
        if (!v.showWhen || conditionMet(v.showWhen)) { ending = v; break; }
      }
    }
    var box = elText("div", "chf-ending");

    if (state.app) {
      // Behall skalet och byt bara innehallet - att riva container skulle ta
      // med sig header och progressbar, och kvittensskarmen skulle landa som
      // en naken textrad pa sidans egen bakgrund.
      var body = container.querySelector(".chf-body");
      var track = container.querySelector(".chf-track");
      var hback = container.querySelector(".chf-headback");
      // Resan ar slut: stapeln full, ingen vag tillbaka in i ett inskickat
      // formular. Men bara om det FANNS en stapel - ett enstegsformular som
      // plotsligt far en full stapel pa kvittensskarmen antyder en resa som
      // aldrig fanns.
      if (track && !track.hidden) {
        var fill = track.querySelector(".chf-fill");
        if (fill) fill.style.width = "100%";
      }
      if (hback) hback.hidden = true;
      var mark = elText("div", "chf-endmark");
      mark.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"' +
        ' stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.2 5.2L20 7"/></svg>';
      box.appendChild(mark);
      box.appendChild(elText("h2", null, ending.title));
      if (ending.html) box.appendChild(elHtml("div", null, interpolate(ending.html)));
      if (body) {
        body.innerHTML = "";
        body.appendChild(box);
      }
      window.scrollTo(0, 0);
      return;
    }

    container.innerHTML = "";
    box.appendChild(elText("h2", null, ending.title));
    if (ending.html) box.appendChild(elHtml("div", null, interpolate(ending.html)));
    container.appendChild(box);
    container.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // -------------------------------------------------------------------- init
  /** Placeholder shown while the config request is in flight. Mirrors the real
   *  layout (label + control pairs, one info block) so the swap is calm rather
   *  than a jump, and keeps the container from collapsing to zero height. */
  function renderSkeleton() {
    var wrap = elText("div", "chf-skeleton");
    wrap.setAttribute("aria-hidden", "true");
    function bar(cls, widthPct) {
      var b = elText("div", "chf-sk " + cls);
      if (widthPct) b.style.width = widthPct;
      return b;
    }
    function field(labelWidth) {
      var f = elText("div", "chf-sk-field");
      f.appendChild(bar("chf-sk-label", labelWidth));
      f.appendChild(bar("chf-sk-input"));
      return f;
    }
    wrap.appendChild(field("42%"));
    wrap.appendChild(bar("chf-sk-info"));
    wrap.appendChild(field("30%"));
    wrap.appendChild(field("36%"));
    wrap.appendChild(field("26%"));
    wrap.appendChild(bar("chf-sk-btn"));
    container.appendChild(wrap);
    // Screen readers get the status; the bars themselves are decorative.
    var status = elText("div", "chf-loading", T.loading);
    status.setAttribute("role", "status");
    container.appendChild(status);
    container.setAttribute("aria-busy", "true");
  }

  /** Slar upp kunden pa `?t=` och lagger hennes serie i state, sa formularet
   *  vet vem hon ar innan forsta render.
   *
   *  Satter tre sorters varden som villkor och mallar kan anvanda:
   *    kund            - adressen, tom nar vi inte vet
   *    forra_bild_url  - senaste uppladdade bilden, for "gor som forra gangen"
   *    antal_bilder    - hur langt hon kommit
   *    dagar_sedan_start - faktiska dagar, sa etiketter slutar pasta "dag 30"
   *
   *  Misslyckas uppslaget gar formularet vidare som om ingen token fanns. Det
   *  ar hela poangen med att den ar en genvag och inte en inloggning: ett
   *  trasigt uppslag ska kosta ett extra steg, aldrig blockera uppladdningen.
   */
  function lookupCustomer() {
    var t = null;
    try { t = new URLSearchParams(window.location.search).get("t"); } catch (e) {}
    if (!t) return Promise.resolve();
    state.values.token = t;
    return fetch(HUB + "/api/forms/series?t=" + encodeURIComponent(t) +
                 "&workspace=" + encodeURIComponent(WORKSPACE) +
                 "&slug=" + encodeURIComponent(FORM_SLUG) +
                 "&market=" + encodeURIComponent(MARKET))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.known) return;
        state.customer = d;
        state.values.kund = d.email;
        state.values.email = d.email;
        // "Forra bilden" ska vara den hon tog NARMAST FORE det steg hon star
        // pa nu. Vet vi steget valjs den; annars faller vi tillbaka pa den
        // senast uppladdade. Utan det kan dag 30-skarmen visa dag 60-bilden.
        var mittSteg = parseInt(state.values.steg, 10);
        var vald = null;
        if (d.steps && mittSteg) {
          for (var n = mittSteg - 1; n >= 1; n--) {
            if (d.steps[String(n)]) { vald = d.steps[String(n)]; break; }
          }
        }
        if (vald || d.latestUrl) state.values.forra_bild_url = vald || d.latestUrl;
        if (d.steps) {
          for (var sk in d.steps) {
            if (d.steps[sk]) state.values["bild_" + sk + "_url"] = d.steps[sk];
          }
        }
        state.values.antal_bilder = String(d.count || 0);
        if (d.daysSinceFirst !== null && d.daysSinceFirst !== undefined) {
          state.values.dagar_sedan_start = String(d.daysSinceFirst);
        }
      })
      .catch(function () {});
  }

  renderSkeleton();
  fetch(HUB + "/api/forms/config?workspace=" + encodeURIComponent(WORKSPACE) + "&slug=" + encodeURIComponent(FORM_SLUG) + "&market=" + encodeURIComponent(MARKET))
    .then(function (r) {
      if (!r.ok) throw new Error("config " + r.status);
      return r.json();
    })
    .then(function (data) {
      state.config = data.form.config;
      applyParamDefaults();
      // Tokenuppslaget EFTER param-defaults: vet vi vem hon ar ska det sla
      // over ett e-postfalt som forifyllts fran en aldre `?e=`-lank.
      return lookupCustomer();
    })
    .then(function () {
      container.removeAttribute("aria-busy");
      render();
    })
    .catch(function () {
      container.removeAttribute("aria-busy");
      container.innerHTML = "";
      var err = elText("div", "chf-toperror", T.loadError);
      err.style.display = "block";
      container.appendChild(err);
    });
})();
