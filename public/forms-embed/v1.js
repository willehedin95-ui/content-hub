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
  };

  // ------------------------------------------------------------------ styles
  var CSS =
    ".chf-root{font-family:inherit;max-width:640px;margin:0 auto;color:#1a1a1a;line-height:1.55}" +
    ".chf-title{font-size:1.35em;font-weight:700;margin:0 0 12px}" +
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
    ".chf-info{background:#eef2f8;border:1px solid #d5deeb;border-radius:10px;padding:14px 16px;margin:0 0 18px}" +
    ".chf-info p{margin:0 0 8px}" +
    ".chf-info p:last-child{margin-bottom:0}" +
    ".chf-info a{color:#1d4ed8;text-decoration:underline}" +
    ".chf-file{border:1px dashed #bbb;border-radius:10px;padding:16px;background:#fafafa}" +
    ".chf-error{color:#b91c1c;font-size:.9em;margin-top:5px;display:none}" +
    ".chf-field.chf-invalid .chf-error{display:block}" +
    ".chf-field.chf-invalid .chf-input,.chf-field.chf-invalid .chf-textarea,.chf-field.chf-invalid .chf-select{border-color:#b91c1c}" +
    ".chf-submit{display:block;width:100%;padding:14px 18px;background:#111;color:#fff;border:0;border-radius:10px;font:inherit;font-weight:700;font-size:1.05em;cursor:pointer}" +
    ".chf-submit:disabled{opacity:.6;cursor:default}" +
    ".chf-toperror{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:10px;padding:12px 14px;margin-bottom:16px;display:none}" +
    ".chf-ending{text-align:left;padding:8px 0}" +
    ".chf-ending h2{font-size:1.3em;margin:0 0 10px}" +
    ".chf-hp{position:absolute;left:-9999px;opacity:0;height:0;overflow:hidden}" +
    ".chf-loading{color:#777;padding:14px 0}";

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
  function isEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }
  function conditionMet(cond) {
    if (!cond) return true;
    var v = state.values[cond.field];
    return cond.in.indexOf(v) !== -1;
  }

  // ------------------------------------------------------------------ render
  function render() {
    container.innerHTML = "";
    var cfg = state.config;

    if (cfg.title) container.appendChild(elText("h2", "chf-title", cfg.title));
    if (cfg.intro) container.appendChild(elHtml("div", "chf-intro", cfg.intro));

    var form = elText("form", "chf-form");
    form.setAttribute("novalidate", "novalidate");

    var topError = elText("div", "chf-toperror");
    form.appendChild(topError);

    cfg.fields.forEach(function (f) {
      var wrap;
      if (f.kind === "info") {
        wrap = elHtml("div", "chf-info", f.html);
      } else {
        wrap = elText("div", "chf-field");
        if (f.label && f.kind !== "checkbox") {
          var lab = elText("label", "chf-label", f.label);
          if (f.required) lab.appendChild(elText("span", "chf-req", "*"));
          lab.setAttribute("for", "chf-" + f.key);
          wrap.appendChild(lab);
        }
        if (f.help) wrap.appendChild(elText("div", "chf-help", f.help));
        wrap.appendChild(buildInput(f));
        wrap.appendChild(elText("div", "chf-error", ""));
      }
      wrap.setAttribute("data-key", f.key);
      if (f.showWhen) {
        wrap.setAttribute("data-showwhen", "1");
        if (!conditionMet(f.showWhen)) wrap.style.display = "none";
      }
      form.appendChild(wrap);
    });

    // Honeypot
    var hp = elText("div", "chf-hp");
    var hpLabel = elText("label", null, "Lämna fältet tomt");
    var hpInput = document.createElement("input");
    hpInput.type = "text";
    hpInput.name = "website";
    hpInput.tabIndex = -1;
    hpInput.autocomplete = "off";
    hpLabel.appendChild(hpInput);
    hp.appendChild(hpLabel);
    form.appendChild(hp);

    var submit = elText("button", "chf-submit", cfg.submitLabel || "Skicka in");
    submit.type = "submit";
    form.appendChild(submit);

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      onSubmit(form, submit, topError);
    });

    container.appendChild(form);
  }

  function buildInput(f) {
    var id = "chf-" + f.key;
    if (f.kind === "textarea") {
      var ta = elText("textarea", "chf-textarea");
      ta.id = id;
      if (f.placeholder) ta.placeholder = f.placeholder;
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
      finp.addEventListener("change", function () {
        var list = Array.prototype.slice.call(finp.files || []).slice(0, f.maxFiles || 3);
        state.files[f.key] = list;
        setValue(f.key, list.map(function (x) { return x.name; }).join(", "));
      });
      fwrap.appendChild(finp);
      return fwrap;
    }
    // text / email / date
    var inp2 = document.createElement("input");
    inp2.className = "chf-input";
    inp2.id = id;
    inp2.type = f.kind === "email" ? "email" : f.kind === "date" ? "date" : "text";
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
  }

  function findField(key) {
    for (var i = 0; i < state.config.fields.length; i++) {
      if (state.config.fields[i].key === key) return state.config.fields[i];
    }
    return null;
  }

  // ---------------------------------------------------------------- validate
  function validate(form) {
    var ok = true;
    state.config.fields.forEach(function (f) {
      if (f.kind === "info") return;
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

  // ------------------------------------------------------------------ submit
  function collectAnswers() {
    var answers = [];
    state.config.fields.forEach(function (f) {
      if (f.kind === "info") return;
      if (f.showWhen && !conditionMet(f.showWhen)) return;
      var v = state.values[f.key];
      if (v === undefined) v = "";
      answers.push({ key: f.key, label: f.label || f.key, value: v });
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
  container.appendChild(elText("div", "chf-loading", "Laddar formulär..."));
  fetch(HUB + "/api/forms/config?workspace=" + encodeURIComponent(WORKSPACE) + "&slug=" + encodeURIComponent(FORM_SLUG) + "&market=" + encodeURIComponent(MARKET))
    .then(function (r) {
      if (!r.ok) throw new Error("config " + r.status);
      return r.json();
    })
    .then(function (data) {
      state.config = data.form.config;
      render();
    })
    .catch(function () {
      container.innerHTML = "";
      var err = elText("div", "chf-toperror", "Formuläret kunde inte laddas just nu. Ladda om sidan eller försök igen om en stund.");
      err.style.display = "block";
      container.appendChild(err);
    });
})();
