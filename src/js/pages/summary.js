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
  var state = { nests: [], patch: "" };
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

    var items = [
      ["Nests found", nonArt.length],
      ["Artificial nests", art.length],
      ["Nests with interval data", nonArt.filter(hasEggOrYoung).length],
      ["Current natural nests", nonArt.filter(isCurrent).length],
      ["Current artificial nests", art.filter(isCurrent).length],
      ["Available artificial nest candidates",
        availableCandidates(rows).length]
    ];

    refs.list.innerHTML = "";

    var card = GuiUI.el("div", "gui-card");
    var ul = GuiUI.el("ul", "gui-summary-list");

    items.forEach(function (pair) {
      var li = GuiUI.el("li");

      li.appendChild(GuiUI.el("strong", null, String(pair[1])));
      li.appendChild(GuiUI.el("span", null, " " + pair[0]));
      ul.appendChild(li);
    });
    card.appendChild(ul);
    refs.list.appendChild(card);
  }

  function optionsFrom(list, valueKey, labelKey) {
    return (list || []).map(function (item) {
      if (typeof item === "string") return { value: item, label: item };
      return { value: item[valueKey], label: item[labelKey] || item[valueKey] };
    });
  }

  function buildFilters(host, lk) {
    var bar = GuiUI.el("div", "gui-form");
    var row = GuiUI.el("div", "gui-field");
    var lab = GuiUI.el("label", "gui-label", "Patch");
    var patch = GuiUI.el("select", "gui-input");

    lab.setAttribute("for", "summaryFilterPatch");
    patch.id = "summaryFilterPatch";

    [{ value: "", label: "All patches" }]
      .concat(optionsFrom(lk.patches, "patch_id", "label"))
      .forEach(function (o) {
        var opt = GuiUI.el("option", null, o.label);

        opt.value = o.value;
        patch.appendChild(opt);
      });

    patch.addEventListener("change", function () {
      state.patch = patch.value;
      render();
    });

    row.appendChild(lab);
    row.appendChild(patch);
    bar.appendChild(row);
    host.appendChild(bar);
  }

  GuiPages.register({
    id: "summary",
    label: "Summary",
    mount: function (host) {
      var head = GuiUI.el("div", "gui-page-head");

      head.appendChild(GuiUI.el("h2", null, "Nest summary"));
      host.appendChild(head);

      var filters = GuiUI.el("div", "gui-card");

      host.appendChild(filters);

      refs.list = GuiUI.el("div");
      host.appendChild(refs.list);

      GuiApi.lookups().then(function (lk) {
        buildFilters(filters, lk);
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
