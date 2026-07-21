// point_counts.js -- mirrors point_counts.xlsx ("her shape").
//
// Her sheet is one row per species x detection within an interval, with
// FIVE distance columns to drop counts into. The modal shows THREE grids,
// one per interval (every count has intervals 1-3), so the interval column
// disappears from the sheet exactly as it does from her paper flow.
//
// Spreadsheet semantics, not web-form semantics:
// - No dropdowns. Species and Det are validated text cells (lower case
//   auto-fills upper); a bad value flags red like spreadsheet data
//   validation, and Save refuses until it is fixed.
// - ONE Save button, at the bottom, pushes the stop-level data AND all
//   three interval grids together.
//
// The DB stores one row per distance (count_interval). The wide<->long
// pivot that nightly_load.R did in R happens here instead, on save.
"use strict";

(function () {
  var DIST = [
    { key: "d1", label: "< 25 m", db: "< 25 m" },
    { key: "d2", label: "25-50 m", db: "25-50 m" },
    { key: "d3", label: "50-75 m", db: "50-75 m" },
    { key: "d4", label: "75-100 m", db: "75-100 m" },
    { key: "d5", label: "> 100 m", db: "> 100 m" }
  ];

  var INTERVALS = [1, 2, 3];
  var DETECTIONS = ["A", "V", "B"];

  var state = { counts: [], lk: null, speciesSet: {} };
  var refs = {};

  // ---- wide <-> long -------------------------------------------------------

  // One grid's rows -> long API rows for its interval.

  function toApi(gridRows, pointCountId, interval) {
    var out = [];

    gridRows.forEach(function (r) {
      DIST.forEach(function (d) {
        var n = r[d.key];

        if (n === null || n === undefined || n === "" || Number(n) === 0) {
          return;
        }

        out.push({
          point_count_id: pointCountId,
          interval: interval,
          species: r.species,
          detection: r.detection,
          distance: d.db,
          count: Number(n)
        });
      });
    });
    return out;
  }

  // Long API rows -> { 1: [rows], 2: [rows], 3: [rows] }, one wide sheet
  // per interval, keyed on species + detection.

  function toGrids(apiRows) {
    var grids = { 1: {}, 2: {}, 3: {} };
    var order = { 1: [], 2: [], 3: [] };

    (apiRows || []).forEach(function (r) {
      var i = Number(r.interval);

      if (!grids[i]) return;

      var k = r.species + "|" + r.detection;

      if (!grids[i][k]) {
        grids[i][k] = { species: r.species, detection: r.detection };
        order[i].push(k);
      }

      DIST.forEach(function (d) {
        if (d.db === r.distance) grids[i][k][d.key] = r.count;
      });
    });

    var out = {};

    INTERVALS.forEach(function (i) {
      out[i] = order[i].map(function (k) { return grids[i][k]; });
    });
    return out;
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

  var HEADER_FIELDS = [
    { key: "count_date", label: "Date" },
    { key: "patch_id", label: "Patch" },
    { key: "start_time", label: "Start time" },
    { key: "observer_id", label: "Observer" },
    { key: "weather", label: "Weather" }
  ];

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

  // ---- grid columns (validated text cells, NO dropdowns) -------------------

  function gridCols() {
    var cols = [
      {
        key: "species",
        label: "Species",
        type: "text",
        width: "7em",
        uppercase: true,
        validate: function (v) {
          return state.speciesSet[String(v).toUpperCase()] === true;
        }
      }
    ];

    DIST.forEach(function (d) {
      cols.push({
        key: d.key,
        label: d.label,
        type: "number",
        width: "4.5em",
        validate: function (v) {
          return !isNaN(Number(v)) && Number(v) >= 0;
        }
      });
    });

    cols.push({
      key: "detection",
      label: "Det",
      type: "text",
      width: "4em",
      uppercase: true,
      validate: function (v) {
        return DETECTIONS.indexOf(String(v).toUpperCase()) !== -1;
      }
    });
    return cols;
  }

  // ---- the combined modal --------------------------------------------------

  function openCount(row) {
    var isNew = !row;
    var dirty = false;
    var grids = {};          // interval -> GuiUI.grid

    var m = GuiUI.modal(
      isNew ? "New point count" : "Point count — " + countTitle(row),
      {
        wide: true,
        beforeClose: function (handle) {
          if (!dirty) return true;

          GuiUI.confirm(
            "There are unsaved changes. Close without saving?"
          ).then(function (yes) {
            if (yes) handle.close(true);
          });
          return false;
        }
      }
    );

    m.el.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === "s") {
        e.preventDefault();
        saveAll();
      }
    });

    // -- stop-level data ----------------------------------------------------

    var head = GuiUI.el("div", "gui-page-head");

    head.appendChild(GuiUI.el("h3", null, "Stop-level data"));

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
              m.close(true);
              GuiUI.status("Point count deleted.", "ok");
              return loadCounts();
            })
            .catch(function (e) {
              GuiUI.status("Delete failed: " + e.message, "err");
              if (window.console) console.error(e);
            });
        });
      });
      head.appendChild(del);
    }
    m.body.appendChild(head);

    var f = GuiUI.form(countFields(state.lk),
      row || { count_date: todayIso(), observer_id: "TNS" }, "pc_hdr_");

    f.el.addEventListener("change", function () { dirty = true; });
    m.body.appendChild(f.el);

    // -- three interval grids ----------------------------------------------

    var gridHosts = {};

    INTERVALS.forEach(function (i) {
      var panel = GuiUI.el("div", "gui-subpanel");

      panel.appendChild(GuiUI.el("h3", null, "Interval " + i));
      gridHosts[i] = GuiUI.el("div");
      panel.appendChild(gridHosts[i]);
      m.body.appendChild(panel);
    });

    function buildGrids(byInterval) {
      INTERVALS.forEach(function (i) {
        gridHosts[i].innerHTML = "";
        grids[i] = GuiUI.grid(gridCols(), byInterval[i] || []);
        grids[i].onChange(function () { dirty = true; });
        gridHosts[i].appendChild(grids[i].el);
      });
      dirty = false;
    }

    function loadGrids() {
      if (isNew) {
        buildGrids({});
        return Promise.resolve();
      }
      return GuiApi.get(
        "/point_counts/" + row.point_count_id + "/intervals"
      ).then(function (r) {
        buildGrids(toGrids(r));
      }).catch(function (e) {
        GuiUI.status("Could not load counts: " + e.message, "err");
        if (window.console) console.error(e);
      });
    }

    // -- ONE save for everything -------------------------------------------

    // The final validation the sheet's data validation would do: no blank
    // stop-level field; every count row needs a valid species and Det.

    function problems() {
      var out = [];
      var header = f.read();

      HEADER_FIELDS.forEach(function (fd) {
        var v = header[fd.key];

        if (v === null || v === undefined || v === "") {
          out.push("Stop-level: " + fd.label + " is blank.");
        }
      });

      // Start time is stored on a 24-hour clock, e.g. 06:05 or 17:30.

      var t = header.start_time;

      if (t && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(t))) {
        out.push("Stop-level: Start time must be 24-hour HH:MM " +
          "(e.g. 06:05).");
      }

      INTERVALS.forEach(function (i) {
        var bad = 0;
        var empty = 0;

        grids[i].rows().forEach(function (r) {
          var sp = String(r.species || "").toUpperCase();
          var det = String(r.detection || "").toUpperCase();

          if (!sp || state.speciesSet[sp] !== true ||
              !det || DETECTIONS.indexOf(det) === -1) {
            bad += 1;
            return;
          }

          // A row with no count in any distance bin pivots to nothing and
          // would silently vanish -- refuse it instead.

          var any = DIST.some(function (d) {
            var n = r[d.key];
            return n !== null && n !== undefined && n !== "" &&
              Number(n) > 0;
          });

          if (!any) empty += 1;
        });
        if (bad > 0) {
          out.push("Interval " + i + ": " + bad +
            " row(s) with a missing or invalid species / Det.");
        }
        if (empty > 0) {
          out.push("Interval " + i + ": " + empty +
            " row(s) with no count in any distance column.");
        }
      });
      return out;
    }

    function saveAll() {
      var probs = problems();

      if (probs.length) {
        GuiUI.status("Not saved — " + probs.join(" "), "err");
        return;
      }

      GuiUI.status("Saving…", "busy");

      var saveHeader = isNew
        ? GuiApi.post("/point_counts", f.read())
        : GuiApi.patch("/point_counts/" + row.point_count_id, f.read());

      saveHeader.then(function (created) {
        if (isNew && created && created.point_count_id) {
          row = created;
          isNew = false;
        }

        var rows = [];

        INTERVALS.forEach(function (i) {
          rows = rows.concat(toApi(grids[i].rows(), row.point_count_id, i));
        });

        return GuiApi.post(
          "/point_counts/" + row.point_count_id + "/intervals",
          { rows: rows }
        );
      }).then(function () {
        dirty = false;
        m.close(true);
        return loadCounts();
      }).then(function () {
        GuiUI.status("Point count saved.", "ok");
      }).catch(function (e) {
        GuiUI.status("Save failed: " + e.message, "err");
        if (window.console) console.error(e);
      });
    }

    var bar = GuiUI.el("div", "gui-actions");
    var save = GuiUI.el("button", "gui-btn gui-btn-primary",
      "Save point count");
    var cancel = GuiUI.el("button", "gui-btn", "Close");

    save.addEventListener("click", saveAll);
    cancel.addEventListener("click", function () { m.close(); });
    bar.appendChild(save);
    bar.appendChild(cancel);
    m.body.appendChild(bar);

    loadGrids();
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

      refs.list = GuiUI.el("div", "gui-scroll");
      host.appendChild(refs.list);

      GuiApi.lookups().then(function (lk) {
        state.lk = lk;

        // The validation list AND the type-ahead: species_engine, falling
        // back to the nest species list if the engine is not populated.

        var engine = (lk.species_engine && lk.species_engine.length)
          ? lk.species_engine.map(function (s) {
              return { value: s.species_code, label: s.species_name };
            })
          : (lk.species || []).map(function (s) {
              return { value: s.species_code, label: s.common_name };
            });

        state.speciesSet = {};
        engine.forEach(function (s) {
          state.speciesSet[String(s.value).toUpperCase()] = true;
        });

        add.addEventListener("click", function () { openCount(null); });
        return loadCounts();
      });
    }
  });
})();
