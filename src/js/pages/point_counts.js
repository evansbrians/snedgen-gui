// point_counts.js -- mirrors point_counts.xlsx ("her shape").
//
// Her sheet is one row per interval x species x detection, with FIVE
// distance columns to drop counts into. A point count runs ~21 rows (max
// 35), so the counts are a live grid, not a form per row.
//
// The DB stores one row per distance (count_interval). The wide<->long pivot
// that nightly_load.R does in R happens here instead, on save.
//
// Interaction: clicking a row (or New point count) opens ONE wide modal:
// stop-level data on top, the counts grid below. No intermediate menu.
"use strict";

(function () {
  var DIST = [
    { key: "d1", label: "< 25 m", db: "< 25 m" },
    { key: "d2", label: "25-50 m", db: "25-50 m" },
    { key: "d3", label: "50-75 m", db: "50-75 m" },
    { key: "d4", label: "75-100 m", db: "75-100 m" },
    { key: "d5", label: "> 100 m", db: "> 100 m" }
  ];

  var state = { counts: [], lk: null };
  var refs = {};

  // ---- wide <-> long -------------------------------------------------------

  function toApi(gridRows, pointCountId) {
    var out = [];

    gridRows.forEach(function (r) {
      DIST.forEach(function (d) {
        var n = r[d.key];

        if (n === null || n === undefined || n === "" || Number(n) === 0) {
          return;
        }

        out.push({
          point_count_id: pointCountId,
          interval: Number(r.interval),
          species: r.species,
          detection: r.detection,
          distance: d.db,
          count: Number(n)
        });
      });
    });
    return out;
  }

  function toGrid(apiRows) {
    var byKey = {};
    var order = [];

    (apiRows || []).forEach(function (r) {
      var k = r.interval + "|" + r.species + "|" + r.detection;

      if (!byKey[k]) {
        byKey[k] = {
          interval: r.interval, species: r.species, detection: r.detection
        };
        order.push(k);
      }

      DIST.forEach(function (d) {
        if (d.db === r.distance) byKey[k][d.key] = r.count;
      });
    });

    return order.map(function (k) { return byKey[k]; });
  }

  // ---- data ----------------------------------------------------------------

  function loadCounts() {
    GuiUI.status("Loading point counts…", "busy");

    return GuiApi.get("/point_counts").then(function (rows) {
      state.counts = rows || [];
      GuiUI.status("");
      renderCounts();
    }).catch(function (e) {
      GuiUI.status("Could not load point counts: " + e.message, "err");
      if (window.console) console.error(e);
    });
  }

  // ---- the count list ------------------------------------------------------

  var COUNT_COLS = [
    { key: "count_date", label: "Date" },
    { key: "patch_id", label: "Patch" },
    { key: "start_time", label: "Start" },
    { key: "observer_id", label: "Observer" },
    { key: "weather", label: "Weather" }
  ];

  function countTitle(row) {
    return GuiUI.dash(row.patch_id) + " · " + GuiUI.dash(row.count_date) +
      " · " + GuiUI.dash(row.start_time);
  }

  function renderCounts() {
    refs.list.innerHTML = "";
    refs.list.appendChild(
      GuiUI.table(COUNT_COLS, state.counts, {
        empty: "No point counts yet.",
        onRowClick: function (row) { openCount(row); }
      })
    );
  }

  function countFields(lk) {
    return [
      { key: "count_date", label: "Date", type: "date", required: true },
      {
        key: "patch_id",
        label: "Patch",
        type: "select",
        options: opts(lk.patches, "patch_id", "label")
      },
      { key: "start_time", label: "Start time", type: "time" },
      {
        key: "observer_id",
        label: "Observer",
        type: "select",
        options: opts(lk.observers, "observer_id", "observer_id")
      },
      { key: "weather", label: "Weather", type: "text" }
    ];
  }

  function todayIso() {
    var d = new Date();
    var mo = String(d.getMonth() + 1);
    var day = String(d.getDate());

    if (mo.length < 2) mo = "0" + mo;
    if (day.length < 2) day = "0" + day;
    return d.getFullYear() + "-" + mo + "-" + day;
  }

  // ---- the combined modal --------------------------------------------------

  // One modal, existing or new: stop-level data on top, counts below. For a
  // NEW count the grid unlocks once the stop-level row is saved (the counts
  // need a point_count_id to attach to).

  function openCount(row) {
    var isNew = !row;
    var m = GuiUI.modal(
      isNew ? "New point count" : "Point count — " + countTitle(row),
      { wide: true }
    );

    // -- stop-level data ----------------------------------------------------

    var head = GuiUI.el("div", "gui-page-head");

    head.appendChild(GuiUI.el("h3", null, "Stop-level data"));

    var headBar = GuiUI.el("div", "gui-actions");
    var saveHead = GuiUI.el("button", "gui-btn gui-btn-primary",
      isNew ? "Save stop-level data" : "Save changes");

    headBar.appendChild(saveHead);

    if (!isNew) {
      var del = GuiUI.el("button", "gui-btn gui-btn-danger", "Delete");

      del.addEventListener("click", function () {
        GuiUI.confirm(
          "Delete this point count and all of its rows? This cannot be " +
          "undone."
        ).then(function (ok) {
          if (!ok) return;

          return GuiApi.del("/point_counts/" + row.point_count_id)
            .then(function () {
              m.close();
              GuiUI.status("Point count deleted.", "ok");
              return loadCounts();
            })
            .catch(function (e) {
              GuiUI.status("Delete failed: " + e.message, "err");
              if (window.console) console.error(e);
            });
        });
      });
      headBar.appendChild(del);
    }

    head.appendChild(headBar);
    m.body.appendChild(head);

    var f = GuiUI.form(countFields(state.lk),
      row || { count_date: todayIso() }, "pc_hdr_");

    m.body.appendChild(f.el);

    saveHead.addEventListener("click", function () {
      saveHead.disabled = true;
      GuiUI.status("Saving…", "busy");

      var save = isNew
        ? GuiApi.post("/point_counts", f.read())
        : GuiApi.patch("/point_counts/" + row.point_count_id, f.read());

      save.then(function (created) {
        GuiUI.status("Stop-level data saved.", "ok");

        if (isNew && created && created.point_count_id) {
          row = created;
          isNew = false;
          saveHead.textContent = "Save changes";
          unlockGrid();
        }
        return loadCounts();
      }).catch(function (e) {
        GuiUI.status("Save failed: " + e.message, "err");
        if (window.console) console.error(e);
      }).then(function () {
        saveHead.disabled = false;
      });
    });

    // -- counts -------------------------------------------------------------

    var countsPanel = GuiUI.el("div", "gui-subpanel");
    var chead = GuiUI.el("div", "gui-page-head");
    var rowCount = GuiUI.el("span", "gui-rowcount", "");
    var saveGridBtn = GuiUI.el("button", "gui-btn gui-btn-primary",
      "Save counts");
    var cActions = GuiUI.el("div", "gui-actions");
    var gridHost = GuiUI.el("div");
    var grid = null;

    cActions.appendChild(rowCount);
    cActions.appendChild(saveGridBtn);
    chead.appendChild(GuiUI.el("h3", null, "Counts"));
    chead.appendChild(cActions);
    countsPanel.appendChild(chead);
    countsPanel.appendChild(gridHost);
    m.body.appendChild(countsPanel);

    function gridCols(lk) {
      var cols = [
        {
          key: "interval",
          label: "Int",
          type: "select",
          width: "4.5em",
          options: [
            { value: "", label: "" }, { value: "1", label: "1" },
            { value: "2", label: "2" }, { value: "3", label: "3" }
          ]
        },
        {
          key: "species", label: "Species", type: "datalist",
          listId: "pcSpecies", width: "7em", uppercase: true
        }
      ];

      DIST.forEach(function (d) {
        cols.push({
          key: d.key, label: d.label, type: "number", width: "4.5em"
        });
      });

      cols.push({
        key: "detection",
        label: "Det",
        type: "select",
        width: "4.5em",
        options: [{ value: "", label: "" }].concat(
          (lk.count_detections || ["A", "V", "B"]).map(function (d) {
            return { value: d, label: d };
          })
        )
      });
      return cols;
    }

    function loadGrid() {
      return GuiApi.get("/point_counts/" + row.point_count_id + "/intervals")
        .then(function (r) {
          var rows = toGrid(r);

          gridHost.innerHTML = "";
          grid = GuiUI.grid(gridCols(state.lk), rows);
          gridHost.appendChild(grid.el);
          rowCount.textContent = rows.length + " rows";
        }).catch(function (e) {
          GuiUI.status("Could not load counts: " + e.message, "err");
          if (window.console) console.error(e);
        });
    }

    function unlockGrid() {
      gridHost.innerHTML = "";
      loadGrid();
    }

    saveGridBtn.addEventListener("click", function () {
      if (!grid || !row) {
        GuiUI.status("Save the stop-level data first.", "err");
        return;
      }

      var bad = grid.rows().filter(function (r) {
        return !r.interval || !r.species || !r.detection;
      });

      if (bad.length) {
        GuiUI.status(
          bad.length + " row(s) need interval, species and detection.",
          "err"
        );
        return;
      }

      var body = { rows: toApi(grid.rows(), row.point_count_id) };

      GuiUI.status("Saving " + body.rows.length + " count rows…", "busy");

      GuiApi.post(
        "/point_counts/" + row.point_count_id + "/intervals", body
      ).then(function () {
        GuiUI.status("Counts saved.", "ok");
        return loadGrid();
      }).catch(function (e) {
        GuiUI.status("Save failed: " + e.message, "err");
        if (window.console) console.error(e);
      });
    });

    if (isNew) {
      gridHost.appendChild(GuiUI.el("p", "gui-empty",
        "Save the stop-level data first — the counts attach to it."));
    } else {
      loadGrid();
    }

    f.focus();
  }

  function opts(list, valueKey, labelKey) {
    return [{ value: "", label: "" }].concat(
      (list || []).map(function (item) {
        if (typeof item === "string") return { value: item, label: item };

        return {
          value: item[valueKey], label: item[labelKey] || item[valueKey]
        };
      })
    );
  }

  // ---- mount ---------------------------------------------------------------

  GuiPages.register({
    id: "point_counts",
    label: "Point counts",
    mount: function (host) {
      var head = GuiUI.el("div", "gui-page-head");

      head.appendChild(GuiUI.el("h2", null, "Point counts"));

      var add = GuiUI.el("button", "gui-btn gui-btn-primary",
        "New point count");

      head.appendChild(add);
      host.appendChild(head);

      refs.list = GuiUI.el("div");
      host.appendChild(refs.list);

      GuiApi.lookups().then(function (lk) {
        state.lk = lk;

        // 198 species: type-ahead, never a dropdown. Fall back to the nest
        // species list if species_engine is not populated yet.

        var engine = (lk.species_engine && lk.species_engine.length)
          ? lk.species_engine.map(function (s) {
              return { value: s.species_code, label: s.species_name };
            })
          : (lk.species || []).map(function (s) {
              return { value: s.species_code, label: s.common_name };
            });

        host.appendChild(GuiUI.datalist("pcSpecies", engine));
        add.addEventListener("click", function () { openCount(null); });
        return loadCounts();
      });
    }
  });
})();
