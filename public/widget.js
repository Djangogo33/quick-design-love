/* ReviewDrop widget — vanilla JS, self-contained */
(function () {
  if (window.__reviewdrop_loaded) return;
  window.__reviewdrop_loaded = true;

  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName("script");
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src && scripts[i].src.indexOf("widget.js") !== -1) return scripts[i];
    }
    return null;
  })();
  if (!script) return;

  var token = script.getAttribute("data-project");
  if (!token) {
    console.warn("[ReviewDrop] data-project missing");
    return;
  }

  var origin = (function () {
    try { return new URL(script.src).origin; } catch (e) { return ""; }
  })();

  var BRAND = "#6366f1";
  var PROJECT_NAME = "";
  var SHOW_BADGE = true;

  // Fetch config
  fetch(origin + "/api/public/widget-config/" + encodeURIComponent(token))
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (!data || !data.project || !data.project.is_active) return;
      BRAND = data.project.brand_color || BRAND;
      PROJECT_NAME = data.project.name || "";
      SHOW_BADGE = data.project.show_badge !== false;
      init();
    })
    .catch(function () {});

  function getCssSelector(el) {
    if (!(el instanceof Element)) return null;
    if (el.id) return "#" + el.id;
    var path = [];
    while (el && el.nodeType === 1 && path.length < 5) {
      var sel = el.nodeName.toLowerCase();
      if (el.className && typeof el.className === "string") {
        var cls = el.className.trim().split(/\s+/).slice(0, 2).join(".");
        if (cls) sel += "." + cls;
      }
      var parent = el.parentNode;
      if (parent) {
        var siblings = Array.prototype.filter.call(parent.children, function (c) { return c.nodeName === el.nodeName; });
        if (siblings.length > 1) sel += ":nth-of-type(" + (siblings.indexOf(el) + 1) + ")";
      }
      path.unshift(sel);
      el = el.parentElement;
    }
    return path.join(" > ");
  }

  function loadHtml2Canvas() {
    return new Promise(function (resolve) {
      if (window.html2canvas) return resolve(window.html2canvas);
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
      s.onload = function () { resolve(window.html2canvas); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
  }

  function init() {
    // Inject styles
    var style = document.createElement("style");
    style.textContent =
      "#rdrop-root,#rdrop-root *{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;}" +
      "#rdrop-btn{position:fixed;bottom:20px;right:20px;z-index:2147483646;display:flex;align-items:center;gap:8px;padding:12px 16px;border-radius:999px;border:0;background:" + BRAND + ";color:#fff;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.18);transition:transform .15s;}" +
      "#rdrop-btn:hover{transform:translateY(-2px);}" +
      "#rdrop-btn svg{width:16px;height:16px;}" +
      "#rdrop-pin-overlay{position:fixed;inset:0;z-index:2147483645;cursor:crosshair;background:rgba(99,102,241,.06);}" +
      "#rdrop-pin-hint{position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#111;color:#fff;padding:8px 14px;border-radius:999px;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.2);}" +
      "#rdrop-modal-bg{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center;padding:16px;}" +
      "@media(min-width:640px){#rdrop-modal-bg{align-items:center;}}" +
      "#rdrop-modal{background:#fff;border-radius:12px;padding:20px;width:100%;max-width:400px;box-shadow:0 20px 40px rgba(0,0,0,.3);}" +
      "#rdrop-modal h3{margin:0 0 12px;font-size:16px;font-weight:600;color:#111;}" +
      "#rdrop-modal label{display:block;font-size:12px;font-weight:500;color:#555;margin:8px 0 4px;}" +
      "#rdrop-modal input,#rdrop-modal textarea{width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:14px;font-family:inherit;color:#111;background:#fff;}" +
      "#rdrop-modal textarea{min-height:90px;resize:vertical;}" +
      "#rdrop-modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;}" +
      "#rdrop-modal button{padding:8px 16px;border-radius:6px;border:0;font-size:14px;font-weight:500;cursor:pointer;}" +
      ".rdrop-cancel{background:transparent;color:#666;}" +
      ".rdrop-submit{background:" + BRAND + ";color:#fff;}" +
      ".rdrop-submit:disabled{opacity:.5;cursor:not-allowed;}" +
      ".rdrop-inline-error{margin-top:12px;padding:8px 10px;background:#fee2e2;color:#991b1b;border-radius:6px;font-size:13px;}" +
      ".rdrop-inline-success{margin-top:12px;padding:8px 10px;background:#d1fae5;color:#065f46;border-radius:6px;font-size:13px;text-align:center;font-weight:500;}" +
      "#rdrop-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#10b981;color:#fff;padding:10px 18px;border-radius:8px;font-size:14px;box-shadow:0 4px 16px rgba(0,0,0,.2);}";
    document.head.appendChild(style);

    var root = document.createElement("div");
    root.id = "rdrop-root";
    document.body.appendChild(root);

    var btn = document.createElement("button");
    btn.id = "rdrop-btn";
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>Feedback</span>';
    btn.onclick = startPinning;
    root.appendChild(btn);

    var state = { pinning: false, pin: null, target: null };

    function startPinning() {
      state.pinning = true;
      btn.style.display = "none";
      var overlay = document.createElement("div");
      overlay.id = "rdrop-pin-overlay";
      var hint = document.createElement("div");
      hint.id = "rdrop-pin-hint";
      hint.textContent = "Cliquez sur l'élément à commenter (Échap pour annuler)";
      root.appendChild(overlay);
      root.appendChild(hint);

      function clickHandler(e) {
        e.preventDefault();
        e.stopPropagation();
        // Find element under the click (overlay is in the way — temporarily hide)
        overlay.style.pointerEvents = "none";
        var target = document.elementFromPoint(e.clientX, e.clientY);
        overlay.style.pointerEvents = "";
        var docHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
        state.pin = {
          x: (e.clientX / window.innerWidth) * 100,
          y: ((e.clientY + window.scrollY) / docHeight) * 100,
        };
        state.target = target;
        cleanup();
        openModal();
      }
      function escHandler(e) { if (e.key === "Escape") { cleanup(); btn.style.display = ""; state.pinning = false; } }
      function cleanup() {
        overlay.removeEventListener("click", clickHandler, true);
        document.removeEventListener("keydown", escHandler);
        overlay.remove();
        hint.remove();
      }
      overlay.addEventListener("click", clickHandler, true);
      document.addEventListener("keydown", escHandler);
    }

    function openModal() {
      var bg = document.createElement("div");
      bg.id = "rdrop-modal-bg";
      bg.innerHTML =
        '<div id="rdrop-modal" onclick="event.stopPropagation()">' +
        "<h3>Laisser un feedback</h3>" +
        '<label>Votre prénom</label>' +
        '<input id="rdrop-name" type="text" placeholder="Camille" />' +
        '<label>Votre message</label>' +
        '<textarea id="rdrop-msg" placeholder="Ce bouton pourrait être plus visible..."></textarea>' +
        '<div id="rdrop-modal-actions">' +
        '<button class="rdrop-cancel" id="rdrop-cancel">Annuler</button>' +
        '<button class="rdrop-submit" id="rdrop-submit">Envoyer</button>' +
        "</div>" +
        (SHOW_BADGE ? '<div style="margin-top:12px;text-align:center;font-size:11px;color:#999;">Propulsé par <a href="https://reviewdrop.app" target="_blank" rel="noopener" style="color:#6366f1;text-decoration:none;font-weight:500;">ReviewDrop</a></div>' : '') +
        "</div>";
      root.appendChild(bg);

      var nameInput = bg.querySelector("#rdrop-name");
      var msgInput = bg.querySelector("#rdrop-msg");
      var submitBtn = bg.querySelector("#rdrop-submit");
      var cancelBtn = bg.querySelector("#rdrop-cancel");

      var stored = "";
      try { stored = localStorage.getItem("reviewdrop_name") || ""; } catch (e) {}
      nameInput.value = stored;
      setTimeout(function () { msgInput.focus(); }, 50);

      function close() { bg.remove(); btn.style.display = ""; state.pinning = false; state.pin = null; }
      cancelBtn.onclick = close;
      bg.onclick = close;

      submitBtn.onclick = async function () {
        var msg = msgInput.value.trim();
        if (!msg) return;
        // Clear any previous inline error
        var prevErr = bg.querySelector(".rdrop-inline-error");
        if (prevErr) prevErr.remove();
        submitBtn.disabled = true;
        submitBtn.textContent = "Envoi...";
        try { localStorage.setItem("reviewdrop_name", nameInput.value); } catch (e) {}

        // Capture screenshot (best-effort, never blocks submission)
        var screenshot = null;
        try {
          var h2c = await loadHtml2Canvas();
          if (h2c) {
            var canvas = await h2c(document.body, { logging: false, scale: 0.6, useCORS: true });
            screenshot = canvas.toDataURL("image/jpeg", 0.7);
            if (screenshot.length > 4_500_000) screenshot = null;
          }
        } catch (e) {
          // Screenshot failed (CORS, taint, etc.) — send feedback without it.
          screenshot = null;
        }

        var body = {
          project_token: token,
          page_url: location.href,
          position_x: state.pin.x,
          position_y: state.pin.y,
          viewport_w: window.innerWidth,
          viewport_h: window.innerHeight,
          css_selector: state.target ? getCssSelector(state.target) : null,
          screenshot_data_url: screenshot,
          author_name: nameInput.value.trim() || "Anonyme",
          message: msg,
          user_agent: navigator.userAgent,
        };

        try {
          var res = await fetch(origin + "/api/public/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error("fail");
          // Success: show inline confirmation for 3s, then close.
          var modalEl = bg.querySelector("#rdrop-modal");
          modalEl.innerHTML =
            '<div class="rdrop-inline-success">Merci ! Feedback envoyé 👍</div>';
          setTimeout(close, 3000);
        } catch (e) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Envoyer";
          var err = document.createElement("div");
          err.className = "rdrop-inline-error";
          err.textContent = "Une erreur est survenue. Réessayez.";
          var actions = bg.querySelector("#rdrop-modal-actions");
          actions.parentNode.insertBefore(err, actions);
        }
      };
    }

    function showToast(text) {
      var t = document.createElement("div");
      t.id = "rdrop-toast";
      t.textContent = text;
      document.body.appendChild(t);
      setTimeout(function () { t.remove(); }, 3000);
    }
  }
})();
