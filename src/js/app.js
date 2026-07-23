// app.js -- the shell: page registry, nav, hash routing, token gate.
//
// Pages register themselves at file scope; this file never imports them.
// Adding a page = adding one <script> to index.html. Nav order follows
// registration order, so the Map page's <script> tag comes LAST in
// index.html -- that is what puts it at the end of the tab row.
"use strict";

(function () {
  var pages = [];
  var mounted = {};

  function register(page) {
    pages.push(page);
  }

  function buildNav() {
    var nav = document.getElementById("guiNav");

    nav.innerHTML = "";

    pages.forEach(function (p) {
      var b = GuiUI.el("button", "gui-tab", p.label);

      b.dataset.page = p.id;
      b.addEventListener("click", function () { location.hash = p.id; });
      nav.appendChild(b);
    });
  }

  // A page's div is created and mounted once, then shown/hidden. Pages keep
  // their own state; the shell never re-mounts them. A page may define
  // onShow(), called every time its tab becomes visible (the map uses it to
  // fix Leaflet's size after being display:none).

  function show(id) {
    var page = pages.filter(function (p) { return p.id === id; })[0] ||
      pages[0];

    if (!page) return;

    var host = document.getElementById("guiPages");

    Array.prototype.forEach.call(
      document.querySelectorAll(".gui-tab"),
      function (b) {
        b.classList.toggle("is-active", b.dataset.page === page.id);
      }
    );

    Array.prototype.forEach.call(
      host.children,
      function (c) {
        c.style.display = (c.dataset.page === page.id) ? "" : "none";
      }
    );

    if (!mounted[page.id]) {
      var div = GuiUI.el("div", "gui-page");

      div.dataset.page = page.id;
      host.appendChild(div);
      mounted[page.id] = true;

      try {
        page.mount(div);
      } catch (e) {
        GuiUI.status("Page failed to load: " + (e && e.message), "err");
        if (window.console) console.error(e);
      }
    }

    if (page.onShow) {
      try {
        page.onShow();
      } catch (e) {
        if (window.console) console.error(e);
      }
    }
    GuiUI.status("");
  }

  function route() {
    // A modal (Add nest, Point Count, ...) used to survive a hash-nav to a
    // different tab: it kept floating over the newly-shown page, fully
    // interactive, blocking the content underneath -- reads as "the app
    // is stuck" (reproduced independently by two reviewers). Nothing
    // clears open modals on a route change, so this does it here, once,
    // for every page rather than each page guarding its own modals.
    // Deliberately a FORCED close (bypasses any beforeClose "unsaved
    // changes?" guard): the alternative -- leaving a popup open across a
    // route the user explicitly navigated to -- is the worse failure
    // mode of the two.

    GuiUI.closeAllModals();
    show((location.hash || "").replace(/^#/, ""));
  }

  // The API is token-gated. Same-origin serving does not change that, so ask
  // once and keep it; a 401 anywhere re-opens this.

  function tokenGate() {
    var gate = document.getElementById("guiTokenGate");
    var input = document.getElementById("guiTokenInput");
    var save = document.getElementById("guiTokenSave");

    function close() {
      gate.style.display = "none";
      boot();
    }

    if (GuiApi.hasToken()) {
      gate.style.display = "none";
      return true;
    }

    gate.style.display = "";
    save.addEventListener("click", function () {
      var t = (input.value || "").trim();

      if (!t) {
        GuiUI.status("Paste your API token first.", "err");
        return;
      }
      GuiApi.setToken(t);
      close();
    });
    return false;
  }

  // A 401 mid-session (a stale/expired token, not the first-load case
  // tokenGate() already handles) re-shows the SAME gate div rather than a
  // new one -- but always reloads on save rather than trying to resume
  // whatever the page was mid-request, since a page that just got a 401
  // may be holding half-loaded state. Guarded against wiring its Save
  // button twice if more than one in-flight request 401s before the
  // reload happens.

  function reopenGateForExpiry() {
    var gate = document.getElementById("guiTokenGate");
    var input = document.getElementById("guiTokenInput");
    var save = document.getElementById("guiTokenSave");
    var intro = gate.querySelector("p");

    gate.style.display = "";
    if (intro) {
      intro.textContent = "Your session token was rejected — paste a new " +
        "one to continue. The page reloads after saving.";
    }

    if (gate.dataset.expiryWired) return;
    gate.dataset.expiryWired = "1";

    save.addEventListener("click", function () {
      var t = (input.value || "").trim();

      if (!t) {
        GuiUI.status("Paste your API token first.", "err");
        return;
      }
      GuiApi.setToken(t);
      location.reload();
    });
  }

  // The ⚙ API button in the header: always reachable, so a stale stored
  // token (or a wrong base URL) can be replaced without touching the
  // browser console. Saving reloads the page for a clean boot.

  function apiSettings() {
    var f = GuiUI.form([
      {
        key: "token",
        label: "API token (blank keeps the current one)",
        type: "password",
        placeholder: "paste new token"
      },
      {
        key: "base",
        label: "API server (blank = automatic)",
        type: "text",
        placeholder: "https://snednestudy.duckdns.org"
      }
    ], { base: localStorage.getItem("guiApiBase") || "" }, "apiset_");

    var m = GuiUI.modal("API settings");

    m.body.appendChild(GuiUI.el("p", "gui-modal-sub",
      "Stored on this laptop only. The page reloads after saving."));
    m.body.appendChild(f.el);

    var bar = GuiUI.el("div", "gui-actions");
    var ok = GuiUI.el("button", "gui-btn gui-btn-primary", "Save & reload");
    var no = GuiUI.el("button", "gui-btn", "Cancel");
    var wipe = GuiUI.el("button", "gui-btn gui-btn-danger", "Clear token");

    ok.addEventListener("click", function () {
      var v = f.read();

      if (v.token) GuiApi.setToken(v.token);
      GuiApi.setBase(v.base || "");
      location.reload();
    });

    wipe.addEventListener("click", function () {
      GuiApi.setToken("");
      location.reload();
    });

    no.addEventListener("click", function () { m.close(); });
    bar.appendChild(ok);
    bar.appendChild(no);
    bar.appendChild(wipe);
    m.body.appendChild(bar);
    f.focus();
  }

  function boot() {
    buildNav();

    // Fail loudly and early: if lookups will not load, nothing else will
    // work, and a page-by-page mystery is worse than one clear message here.

    GuiApi.lookups().then(function () {
      window.addEventListener("hashchange", route);
      route();
    }).catch(function (e) {
      if (e && e.status === 401) {
        GuiUI.status(
          "Token rejected — use the ⚙ API button (top right) to paste a " +
            "new one.",
          "err"
        );
        return;
      }
      GuiUI.status(
        "Could not reach the API: " + (e && e.message) +
          " — check the server under ⚙ API (top right).",
        "err"
      );
      if (window.console) console.error(e);
    });
  }

  window.GuiPages = { register: register };

  // Light / dark switch (checkbox = dark). The saved choice is applied
  // pre-paint by an inline <script> in index.html; this flips + persists.

  function themeToggle() {
    var cb = document.getElementById("guiThemeToggle");

    if (!cb) return;

    cb.checked = document.documentElement.dataset.theme === "dark";
    cb.addEventListener("change", function () {
      var next = cb.checked ? "dark" : "light";

      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem("guiTheme", next);
      } catch (e) {}
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var settings = document.getElementById("guiApiSettings");

    if (settings) settings.addEventListener("click", apiSettings);
    themeToggle();

    // ONE registration covers every page's request, present and future --
    // see api.js's onUnauthorized. Previously only boot()'s own initial
    // /lookups call actually reopened anything on a 401; every page-level
    // catch just printed an error and stopped.

    GuiApi.onUnauthorized(reopenGateForExpiry);

    if (tokenGate()) boot();
  });
})();
