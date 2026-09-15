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
  };

  // ------------------------------------------------------------------ styles
  var CSS =
    ".chf-root{font-family:inherit;max-width:640px;margin:0 auto;padding:0 20px;box-sizing:border-box;color:#1a1a1a;line-height:1.55}" +
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
    ".chf-submit{display:block;width:100%;padding:14px 18px;background:#111;color:#fff;border:0;border-radius:10px;font:inherit;font-weight:700;font-size:1.05em;cursor:pointer}" +
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
    ".chf-app .chf-head{display:flex;align-items:center;padding:14px 20px;min-height:64px;" +
    "width:100%;max-width:680px;margin:0 auto;box-sizing:border-box}" +
    // Ett enstegsformular har varken tillbakaknapp eller stapel. Da ar headern
    // 64 px tom yta som trycker ner rubriken utan att bara nagot.
    ".chf-app.chf-bare .chf-head{min-height:0;padding:12px 20px 0}" +
    ".chf-app .chf-headback{width:36px;height:36px;padding:0;border:0;border-radius:50%;" +
    "background:rgba(0,0,0,.04);color:var(--chf-text);display:flex;align-items:center;" +
    "justify-content:center;cursor:pointer;transition:background .15s,transform .15s}" +
    ".chf-app .chf-headback:hover{background:rgba(0,0,0,.08)}" +
    ".chf-app .chf-headback:active{transform:scale(.94)}" +
    ".chf-app .chf-headback svg{width:18px;height:18px}" +
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
    ".chf-app .chf-step{flex:1;display:flex;flex-direction:column}" +
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

    ".chf-app .chf-slide-title{font-size:22px;font-weight:700;line-height:1.35;" +
    "color:var(--chf-text);margin:0 0 6px}" +
    ".chf-app .chf-slide-sub{font-size:16px;line-height:1.6;color:var(--chf-muted);margin:0 0 20px}" +
    ".chf-app .chf-title{font-size:22px;font-weight:700;line-height:1.35;text-align:center;margin:0 0 6px}" +
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

    // Uppladdningszonen ar stegets bildblock och ska darfor vara stor och
    // inbjudande, inte en tunn gra streckad ruta.
    ".chf-app .chf-file{background:var(--chf-surface);border:2px dashed " +
    "color-mix(in srgb,var(--chf-brand) 55%,#fff);border-radius:20px;min-height:230px;" +
    "transition:border-color .2s,background .2s}" +
    ".chf-app .chf-file:hover,.chf-app .chf-file.chf-file-over{border-color:var(--chf-brand);" +
    "background:color-mix(in srgb,var(--chf-brand) 6%,#fff)}" +
    ".chf-app .chf-file-icon{width:48px;height:48px;color:var(--chf-brand);opacity:1}" +
    ".chf-app .chf-file-main{font-size:17px;color:var(--chf-text)}" +
    ".chf-app .chf-file-sub{color:var(--chf-muted)}" +
    ".chf-app .chf-file-preview img{width:76px;height:76px;border-radius:12px}" +
    ".chf-app .chf-file-change{color:var(--chf-brand)}" +

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

  function isEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }
  function conditionMet(cond) {
    if (!cond) return true;
    var v = state.values[cond.field];
    var empty = v === undefined || v === null || v === "" || v === false;
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
    var back = elText("button", "chf-back", "Tillbaka");
    back.type = "button";
    back.addEventListener("click", function () { showStep(stepIdx - 1); });
    stepEl.appendChild(back);
  }

  /** "Steg 2 av 3" - ett flerstegsformular ska visa var man ar och hur mycket
   *  som aterstar. Utan den vet hon inte om det ar ett steg kvar eller fem. */
  function updateStepIndicator(idx, total) {
    if (state.app) {
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
    if (label) label.textContent = "Steg " + (idx + 1) + " av " + total;
    if (fill) fill.style.width = Math.round(((idx + 1) / total) * 100) + "%";
  }

  function showStep(idx) {
    state.currentStep = idx;
    var stepEls = container.querySelectorAll("[data-step]");
    for (var i = 0; i < stepEls.length; i++) {
      stepEls[i].style.display = String(idx) === stepEls[i].getAttribute("data-step") ? "" : "none";
    }
    updateStepIndicator(idx, stepEls.length);
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
    back.setAttribute("aria-label", "Tillbaka");
    back.hidden = true;
    back.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"' +
      ' stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/></svg>';
    back.addEventListener("click", function () {
      if (state.currentStep > 0) showStep(state.currentStep - 1);
    });
    head.appendChild(back);
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
            if (!f.required) lab.appendChild(elText("span", "chf-optional", " (valfritt)"));
            lab.setAttribute("for", "chf-" + f.key);
            wrap.appendChild(lab);
          }
          if (f.help) wrap.appendChild(elText("div", "chf-help", f.help));
          wrap.appendChild(buildInput(f));
          wrap.appendChild(elText("div", "chf-error", ""));
        }
        wrap.setAttribute("data-key", f.key);
        if (f.kind === "hidden") wrap.style.display = "none";
        if (f.showWhen) {
          wrap.setAttribute("data-showwhen", "1");
          if (!conditionMet(f.showWhen)) wrap.style.display = "none";
        }
        stepEl.appendChild(wrap);
      });

      if (stepIdx < steps.length - 1) {
        // Mellansteg: Fortsätt-knapp som validerar stegets synliga fält
        var cont = elText("button", "chf-submit", step.continueLabel || "Fortsätt");
        cont.type = "button";
        cont.addEventListener("click", function () {
          topError.style.display = "none";
          if (!validate(form, step.fields)) {
            var firstInvalid = stepEl.querySelector(".chf-invalid");
            if (firstInvalid) firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
          }
          showStep(stepIdx + 1);
        });
        stepEl.appendChild(cont);
        addBackButton(stepEl, stepIdx);
      } else {
        // Sista steget: honeypot + submit
        var hp = elText("div", "chf-hp");
        var hpLabel = elText("label", null, "Lämna fältet tomt");
        var hpInput = document.createElement("input");
        hpInput.type = "text";
        hpInput.name = "website";
        hpInput.tabIndex = -1;
        hpInput.autocomplete = "off";
        hpLabel.appendChild(hpInput);
        hp.appendChild(hpLabel);
        stepEl.appendChild(hp);

        var submit = elText("button", "chf-submit", cfg.submitLabel || "Skicka in");
        submit.type = "submit";
        stepEl.appendChild(submit);
        addBackButton(stepEl, stepIdx);

        form.addEventListener("submit", function (ev) {
          ev.preventDefault();
          onSubmit(form, submit, topError);
        });
      }

      form.appendChild(stepEl);
    });

    mount.appendChild(form);
    // Indikatorn maste sattas aven for forsta steget - showStep() kors bara
    // nar man byter steg, sa utan detta var den tom tills forsta klicket.
    updateStepIndicator(0, steps.length);
    syncSubmitVisibility();
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
      var ph = elText("option", null, f.placeholder || "Välj ett alternativ");
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
        inp.addEventListener("change", function () { if (inp.checked) setValue(f.key, o.value); });
        lab.appendChild(inp);
        lab.appendChild(elText("span", null, o.label));
        group.appendChild(lab);
      });
      return group;
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
    if (f.kind === "file") {
      var fwrap = elText("div", "chf-file");
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
      idle.appendChild(elText("div", "chf-file-main", f.placeholder || "Välj en bild"));
      idle.appendChild(elText("div", "chf-file-sub", "Tryck här för att ta en ny bild eller välja en du redan har"));

      // Valt lage: miniatyr sa hon ser VILKEN bild hon valde, inte bara
      // filnamnet. Hon har ofta tre snarlika selfies i rullen.
      var chosen = elText("div", "chf-file-preview");
      chosen.style.display = "none";

      function render(list) {
        if (!list.length) {
          idle.style.display = "";
          chosen.style.display = "none";
          return;
        }
        idle.style.display = "none";
        chosen.replaceChildren();
        var file = list[0];
        if (/^image\//.test(file.type)) {
          var img = document.createElement("img");
          img.alt = "";
          img.src = URL.createObjectURL(file);
          img.addEventListener("load", function () { URL.revokeObjectURL(img.src); });
          chosen.appendChild(img);
        }
        var namn = list.length > 1 ? list.length + " filer valda" : file.name;
        var meta = elText("div", "chf-file-name");
        meta.appendChild(elText("div", null, namn));
        meta.appendChild(elText("div", "chf-file-change", "Tryck för att byta"));
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

      fwrap.appendChild(idle);
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
      if (tf && tf.html) tpls[t].innerHTML = interpolate(tf.html);
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
  function syncSubmitVisibility() {
    var fields = state.config.fields || [];
    var emailField = null;
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].role === "email") { emailField = fields[i]; break; }
    }
    // No e-mail field at all: leave the button alone and let the server judge.
    var deliverable = !emailField || !emailField.showWhen || conditionMet(emailField.showWhen);
    var btns = container.querySelectorAll(".chf-submit");
    for (var j = 0; j < btns.length; j++) {
      if (btns[j].type === "submit") btns[j].style.display = deliverable ? "" : "none";
    }
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
        msg = "Det här fältet är obligatoriskt.";
      } else if (f.kind === "email" && v && !isEmail(String(v))) {
        msg = "Ange en giltig e-postadress.";
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
        uploads.push(
          fetch(HUB + "/api/forms/upload", { method: "POST", body: fd })
            .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
            .then(function (res) {
              if (!res.r.ok || !res.j.url) throw new Error(res.j.error || "Uppladdningen misslyckades");
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
    submitBtn.textContent = "Skickar...";

    var hpInput = form.querySelector('input[name="website"]');

    uploadFiles()
      .then(function (files) {
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
        if (!res.r.ok) throw new Error(res.j.error || "Något gick fel. Försök igen.");
        showEnding(res.j.gate);
      })
      .catch(function (err) {
        state.submitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
        showTopError(topError, (err && err.message) || "Något gick fel. Kontrollera din uppkoppling och försök igen - dina svar finns kvar.");
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
      if (ending.html) box.appendChild(elHtml("div", null, ending.html));
      if (body) {
        body.innerHTML = "";
        body.appendChild(box);
      }
      window.scrollTo(0, 0);
      return;
    }

    container.innerHTML = "";
    box.appendChild(elText("h2", null, ending.title));
    if (ending.html) box.appendChild(elHtml("div", null, ending.html));
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
    var status = elText("div", "chf-loading", "Laddar formulär...");
    status.setAttribute("role", "status");
    container.appendChild(status);
    container.setAttribute("aria-busy", "true");
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
      container.removeAttribute("aria-busy");
      render();
    })
    .catch(function () {
      container.removeAttribute("aria-busy");
      container.innerHTML = "";
      var err = elText("div", "chf-toperror", "Formuläret kunde inte laddas just nu. Ladda om sidan eller försök igen om en stund.");
      err.style.display = "block";
      container.appendChild(err);
    });
})();
