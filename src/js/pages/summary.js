// summary.js -- the landing tab: a patch-filterable nest summary.
//
// Definitions (Brian's spec):
// - Non-artificial nests: ids like N060 -- N + digits only. With "All
//   patches" selected the NLB / NSP groups are EXCLUDED; selecting their
//   patch brings them in (they are that patch's nests).
// - Artificial nests: the NQ group.
// - Identified nests: non-artificial nests where at least one check saw
//   an egg or nestling (GET /nests ships max_eggs / max_young).
// - Current: nest_fate is none of Unknown / Failure / Success.
"use strict";

(function () {
  var state = { nests: [], patch: "", lk: null };
  var refs = {};

  var CONCLUDED = ["Unknown", "Failure", "Success"];

  function isArtificial(n) {
    return /^NQ\d+/.test(String(n.nest_id || ""));
  }

  function isPlainN(n) {
    return /^N\d+$/.test(String(n.nest_id || ""));
  }

  function isCurrent(n) {
    var fate = n.nest_fate;

    if (fate === null || fate === undefined || fate === "") return true;
    return CONCLUDED.indexOf(String(fate)) === -1;
  }

  function hasEggOrYoung(n) {
    return Number(n.max_eggs) > 0 || Number(n.max_young) > 0;
  }

  // Available candidates: flagged artificial_candidate, CONCLUDED (a
  // fate of Success / Failure / Unknown -- a current nest cannot be a
  // candidate yet), not an NQ nest, and not yet CONVERTED -- once NQ104
  // exists, N104 is spent. Same rule as the map's Artificial candidates
  // view. Conversion is checked against ALL nests, not just the
  // selected patch.

  function availableCandidates(rows) {
    var nqNums = {};

    state.nests.forEach(function (n) {
      var m = /^NQ(\d+)/.exec(String(n.nest_id || ""));

      if (m) nqNums[m[1]] = true;
    });

    return rows.filter(function (n) {
      if (Number(n.artificial_candidate) !== 1) return false;
      if (isCurrent(n)) return false;
      if (isArtificial(n)) return false;

      var m = /^N[A-Z]*?(\d+)/.exec(String(n.nest_id || ""));

      return !(m && nqNums[m[1]]);
    });
  }

  // ---- per-patch / per-species breakdown -----------------------------------
  //
  // The Boss's ask: "no per-patch or per-species breakdown beyond a single
  // dropdown filter." This computes both from the SAME classification
  // rules the tiles above use (isArtificial/isCurrent/hasEggOrYoung), so
  // the breakdown table and the headline tiles can never disagree with
  // each other about what counts as what.

  function patchBreakdown() {
    var patches = ((state.lk && state.lk.patches) || []).map(function (p) {
      return typeof p === "string" ? p : p.patch_id;
    });

    return patches.map(function (patchId) {
      var rows = state.nests.filter(function (n) {
        return String(n.patch_id) === String(patchId);
      });

      // Inside a single named patch every non-NQ nest belongs to it
      // (the "All patches" plain-N-only rule is specifically an
      // all-patches artifact -- see the module comment at the top of
      // this file), matching how the tiles above compute "this patch".

      var nonArt = rows.filter(function (n) { return !isArtificial(n); });
      var art = rows.filter(isArtificial);

      return {
        patch: patchId,
        nestsFound: nonArt.length,
        artificial: art.length,
        intervalData: nonArt.filter(hasEggOrYoung).length,
        currentNatural: nonArt.filter(isCurrent).length,
        currentArtificial: art.filter(isCurrent).length
      };
    });
  }

  function speciesBreakdown(rows) {
    var counts = {};

    rows.forEach(function (n) {
      var label = n.species_common || n.species_code || "(unspecified)";

      counts[label] = (counts[label] || 0) + 1;
    });

    return Object.keys(counts).sort(function (a, b) {
      return counts[b] - counts[a] || a.localeCompare(b);
    }).map(function (label) {
      return { species: label, count: counts[label] };
    });
  }

  // ---- CSV export -----------------------------------------------------------
  //
  // "Some kind of exportable summary report (CSV/PDF)... that I can hand
  // to a co-author or paste into an annual report without retyping
  // numbers." A CSV a spreadsheet opens directly covers that without
  // needing a PDF renderer in the browser.

  function csvField(v) {
    var s = String(v === null || v === undefined ? "" : v);

    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function csvRow(cells) {
    return cells.map(csvField).join(",") + "\r\n";
  }

  function buildCsv() {
    var rows = selection();
    var nonArt = rows.filter(function (n) {
      return state.patch ? !isArtificial(n) : isPlainN(n);
    });
    var art = rows.filter(isArtificial);
    var out = "";

    out += csvRow(["Snedgen nest study -- summary export"]);
    out += csvRow(["Generated", new Date().toISOString().slice(0, 10)]);
    out += csvRow(["Filter",
      state.patch ? prettyPatch(state.patch) : "All patches"]);
    out += "\r\n";

    out += csvRow(["Headline totals for current filter"]);
    out += csvRow(["Nests found", nonArt.length]);
    out += csvRow(["Artificial nests", art.length]);
    out += csvRow(["Nests with interval data", nonArt.filter(hasEggOrYoung).length]);
    out += csvRow(["Current natural nests", nonArt.filter(isCurrent).length]);
    out += csvRow(["Current artificial nests", art.filter(isCurrent).length]);
    out += csvRow(["Available artificial nest candidates",
      availableCandidates(rows).length]);
    out += "\r\n";

    out += csvRow(["By patch (every patch, regardless of the filter above)"]);
    out += csvRow(["Patch", "Nests found", "Artificial", "With interval data",
      "Current natural", "Current artificial"]);
    patchBreakdown().forEach(function (p) {
      out += csvRow([prettyPatch(p.patch), p.nestsFound, p.artificial,
        p.intervalData, p.currentNatural, p.currentArtificial]);
    });
    out += "\r\n";

    out += csvRow(["By species (within the current filter)"]);
    out += csvRow(["Species", "Nests"]);
    speciesBreakdown(nonArt.concat(art)).forEach(function (s) {
      out += csvRow([s.species, s.count]);
    });

    return out;
  }

  function prettyPatch(v) {
    var s = String(v || "").replace(/_/g, " ").trim();

    return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
  }

  function exportCsv() {
    var csv = buildCsv();
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = GuiUI.el("a");
    var stamp = new Date().toISOString().slice(0, 10);

    a.href = url;
    a.download = "nest_summary_" + stamp +
      (state.patch ? "_" + state.patch : "") + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    GuiUI.status("Summary exported.", "ok");
  }

  function loadNests() {
    GuiUI.status("Loading summary…", "busy");

    return GuiApi.get("/nests").then(function (rows) {
      state.nests = rows || [];
      GuiUI.status("");
      render();
    }).catch(function (e) {
      GuiUI.status("Could not load nests: " + e.message, "err");
      if (window.console) console.error(e);
    });
  }

  function selection() {
    if (!state.patch) return state.nests;
    return state.nests.filter(function (n) {
      return String(n.patch_id) === state.patch;
    });
  }

  function render() {
    var rows = selection();

    // All-patches view: only the plain N group counts as non-artificial
    // (NLB / NSP stay out until their patch is picked). A selected patch
    // owns every non-NQ nest inside it.

    var nonArt = rows.filter(function (n) {
      return state.patch ? !isArtificial(n) : isPlainN(n);
    });
    var art = rows.filter(isArtificial);

    // Each tile carries its own one-line "why" so the total on this page
    // never has to be reconciled by hand against the Nests tab's row
    // count -- that reconciliation (nonArt + art = every row, but each
    // tile below only counts ONE of the two groups) is exactly what
    // confused a reviewer counting rows herself. "sub" tiles are the
    // narrower cuts of the two headline numbers above them.

    var tiles = [
      {
        value: nonArt.length,
        label: "Nests found",
        hint: "Non-artificial nests" +
          (state.patch ? " in this patch" : " (N-prefixed; NLB/NSP " +
            "nests count once you pick their patch)") + "."
      },
      {
        value: art.length,
        label: "Artificial nests",
        hint: "The NQ group -- counted separately from Nests found above, " +
          "which is why the two numbers don't sum to \"every row on the " +
          "Nests tab.\""
      },
      {
        value: nonArt.filter(hasEggOrYoung).length,
        label: "Nests with interval data",
        sub: true,
        hint: "Of the nests found above, how many have a check recording " +
          "an egg or nestling."
      },
      {
        value: nonArt.filter(isCurrent).length,
        label: "Current natural nests",
        sub: true,
        hint: "Fate not yet Unknown / Failure / Success."
      },
      {
        value: art.filter(isCurrent).length,
        label: "Current artificial nests",
        sub: true,
        hint: "Same current-fate rule, within the artificial-nest group."
      },
      {
        value: availableCandidates(rows).length,
        label: "Available artificial nest candidates",
        sub: true,
        hint: "Concluded, flagged as a candidate, not already converted " +
          "to an NQ nest."
      }
    ];

    refs.list.innerHTML = "";

    var grid = GuiUI.el("div", "gui-stat-grid");

    tiles.forEach(function (t) {
      var tile = GuiUI.el("div",
        "gui-stat-tile" + (t.sub ? " gui-stat-sub" : ""));

      tile.appendChild(GuiUI.el("div", "gui-stat-value", String(t.value)));
      tile.appendChild(GuiUI.el("div", "gui-stat-label", t.label));
      if (t.hint) tile.appendChild(GuiUI.el("div", "gui-stat-hint", t.hint));
      grid.appendChild(tile);
    });
    refs.list.appendChild(grid);

    // Per-patch and per-species breakdown tables -- both sortable
    // (GuiUI.table's default), so "which patch has the most current
    // nests" or "which species is most represented" is a header click,
    // not mental arithmetic across the tiles above.

    var patchPanel = GuiUI.el("div", "gui-subpanel");

    patchPanel.appendChild(GuiUI.el("h3", null, "By patch"));
    patchPanel.appendChild(GuiUI.table(
      [
        { key: "patch", label: "Patch",
          format: function (v) { return prettyPatch(v); } },
        { key: "nestsFound", label: "Nests found" },
        { key: "artificial", label: "Artificial" },
        { key: "intervalData", label: "With interval data" },
        { key: "currentNatural", label: "Current natural" },
        { key: "currentArtificial", label: "Current artificial" }
      ],
      patchBreakdown(),
      { empty: "No patches in /lookups yet." }
    ));
    refs.list.appendChild(patchPanel);

    var speciesPanel = GuiUI.el("div", "gui-subpanel");

    speciesPanel.appendChild(GuiUI.el("h3", null, "By species" +
      (state.patch ? " — " + prettyPatch(state.patch) : " — all patches")));
    speciesPanel.appendChild(GuiUI.table(
      [
        { key: "species", label: "Species" },
        { key: "count", label: "Nests" }
      ],
      speciesBreakdown(nonArt.concat(art)),
      { empty: "No nests in this selection yet." }
    ));
    refs.list.appendChild(speciesPanel);
  }

  // The Patch dropdown used to re-filter the headline tiles above to a
  // single patch. It was removed because it duplicated what the "By
  // patch" table below already shows, one row per patch, sortable -- the
  // same numbers, without a second control to keep in sync. state.patch
  // stays in the module (CSV export and the tiles still branch on it) but
  // now never gets set to anything but "" (all patches).

  GuiPages.register({
    id: "summary",
    label: "Summary",
    mount: function (host) {
      var head = GuiUI.el("div", "gui-page-head");

      head.appendChild(GuiUI.el("h2", null, "Nest summary"));

      var exportBtn = GuiUI.el("button", "gui-btn", "Export CSV");

      exportBtn.addEventListener("click", exportCsv);
      head.appendChild(exportBtn);
      host.appendChild(head);

      refs.list = GuiUI.el("div");
      host.appendChild(refs.list);

      GuiApi.lookups().then(function (lk) {
        state.lk = lk;
        return loadNests();
      }).catch(function (e) {
        GuiUI.status("Could not load lookups: " + e.message, "err");
        if (window.console) console.error(e);
      });
    },

    // Data may have changed on other tabs; refresh when shown.

    onShow: function () {
      if (state.nests.length) loadNests();
    }
  });
})();
