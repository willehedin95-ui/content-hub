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
    ".chf-steps{font-size:.85em;color:#555;margin:0 0 14px;font-weight:600}" +
    // Tillbaka: sekundar, alltid minst 44px hog trots att den ar textlank.
    ".chf-back{display:block;width:100%;margin-top:10px;padding:12px;background:none;border:0;" +
    "font:inherit;color:#555;text-decoration:underline;cursor:pointer;min-height:44px}" +
    ".chf-optional{font-weight:400;color:#555}" +
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

  var styleEl = document.createElement("style");
  styleEl.textContent = CSS;
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
    if (stepIdx === 0) return;
    var back = elText("button", "chf-back", "Tillbaka");
    back.type = "button";
    back.addEventListener("click", function () { showStep(stepIdx - 1); });
    stepEl.appendChild(back);
  }

  /** "Steg 2 av 3" - ett flerstegsformular ska visa var man ar och hur mycket
   *  som aterstar. Utan den vet hon inte om det ar ett steg kvar eller fem. */
  function updateStepIndicator(idx, total) {
    var el = container.querySelector(".chf-steps");
    if (!el) return;
    if (total < 2) { el.style.display = "none"; return; }
    el.textContent = "Steg " + (idx + 1) + " av " + total;
  }

  function showStep(idx) {
    state.currentStep = idx;
    var stepEls = container.querySelectorAll("[data-step]");
    for (var i = 0; i < stepEls.length; i++) {
      stepEls[i].style.display = String(idx) === stepEls[i].getAttribute("data-step") ? "" : "none";
    }
    updateStepIndicator(idx, stepEls.length);
    container.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function render() {
    container.innerHTML = "";
    var cfg = state.config;

    if (cfg.title) container.appendChild(elText("h2", "chf-title", cfg.title));
    if (cfg.intro) container.appendChild(elHtml("div", "chf-intro", cfg.intro));

    container.appendChild(elText("div", "chf-steps", ""));

    var form = elText("form", "chf-form");
    form.setAttribute("novalidate", "novalidate");

    var topError = elText("div", "chf-toperror");
    form.appendChild(topError);

    var steps = splitSteps(cfg.fields);

    steps.forEach(function (step, stepIdx) {
      var stepEl = elText("div", "chf-step");
      stepEl.setAttribute("data-step", String(stepIdx));
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

    container.appendChild(form);
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
    container.innerHTML = "";
    var box = elText("div", "chf-ending");
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
