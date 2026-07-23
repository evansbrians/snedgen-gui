// coverboards.js -- boards, their checks, and per-species observations.
//
// Modeled on the Cameras page: the TABLE lists unique boards (patch +
// board number), like the app's infrastructure view. Clicking a board opens
// its modal listing every check of that board, with the New check button
// (patch + board + today prefilled). Clicking a check opens the check
// modal: metadata on top, observations below.
//
// coverboard_check is the parent; coverboard_obs are its children,
// ON DELETE CASCADE. Boards themselves are infrastructure -- the list is
// the union of boards seen in checks and the gps 'coverboard' points
// ("<patch>_cb_<n>"), so a never-checked board is still clickable.
"use strict";

(function () {
  var state = { checks: [], boards: [], patch: "" };
  var refs = {};

  // ---- data ----------------------------------------------------------------

  function loadChecks() {
    GuiUI.status("Loading coverboards…", "busy");

    var checks = GuiApi.get("/coverboard_checks");
    var points = GuiApi.get("/gps_points?class=coverboard")
      .catch(function () { return null; });

    return Promise.all([checks, points]).then(function (res) {
      state.checks = res[0] || [];
      state.boards = buildBoards(state.checks, res[1]);
      GuiUI.status("");
      renderBoards();
    }).catch(function (e) {
      GuiUI.status("Could not load checks: " + e.message, "err");
      if (window.console) console.error(e);
    });
  }

  // Unique (patch, board): every board ever checked, plus every gps point
  // named "<patch>_cb_<n>" that has no check yet.

  function buildBoards(checks, fc) {
    var by = {};

    function slot(patch, num) {
      var k = patch + "|" + num;

      if (!by[k]) {
        by[k] = {
          patch_id: patch,
          board_num: num,
          n_checks: 0,
          last_check: null
        };
      }
      return by[k];
    }

    checks.forEach(function (c) {
      if (c.patch_id === null || c.board_num === null) return;

      var b = slot(String(c.patch_id), Number(c.board_num));

      b.n_checks += 1;
      if (c.check_date && (!b.last_check || c.check_date > b.last_check)) {
        b.last_check = c.check_date;
      }
    });

    (((fc || {}).features) || []).forEach(function (f) {
      var name = (f.properties || {}).point_name ||
        (f.properties || {}).name || "";
      var m = /^(.+)_cb_(\d+)$/.exec(name);

      if (m) slot(m[1], Number(m[2]));
    });

    return Object.keys(by).map(function (k) { return by[k]; })
      .sort(function (a, b) {
        return a.patch_id === b.patch_id
          ? a.board_num - b.board_num
          : String(a.patch_id).localeCompare(String(b.patch_id));
      });
  }

  var BOARD_COLS = [
    { key: "patch_id", label: "Patch" },
    { key: "board_num", label: "Board" },
    { key: "n_checks", label: "Checks" },
    { key: "last_check", label: "Last check" }
  ];

  var CHECK_COLS = [
    { key: "check_date", label: "Date" },
    { key: "check_time", label: "Time" },
    { key: "observer_id", label: "Observer" },
    { key: "notes", label: "Notes" }
  ];

  function checkFields(lk) {
    return [
      { key: "check_date", label: "Date", type: "date", required: true },
      {
        key: "patch_id",
        label: "Patch",
        type: "select",
        options: optionsFrom(lk.patches, "patch_id", "label")
      },
      { key: "board_num", label: "Board number", type: "number" },
      { key: "check_time", label: "Time", type: "time" },
      {
        key: "observer_id",
        label: "Observer",
        type: "select",
        options: optionsFrom(lk.observers, "observer_id", "observer_id")
      },
      { key: "notes", label: "Notes", type: "textarea", span: "full" }
    ];
  }

  function checkTitle(row) {
    return GuiUI.dash(row.patch_id) + " board " + GuiUI.dash(row.board_num) +
      " — " + GuiUI.dash(row.check_date);
  }

  function visibleBoards() {
    if (!state.patch) return state.boards;
    return state.boards.filter(function (b) {
      return b.patch_id === state.patch;
    });
  }

  function renderBoards() {
    refs.checkList.innerHTML = "";
    refs.checkList.appendChild(
      GuiUI.table(BOARD_COLS, visibleBoards(), {
        empty: "No boards match this filter.",
        onRowClick: function (b) { openBoard(b); }
      })
    );
  }

  // ---- the board modal: every check of one board ---------------------------

  function openBoard(board) {
    var m = GuiUI.modal(
      "Board — " + GuiUI.dash(board.patch_id) + " cb " +
        GuiUI.dash(board.board_num),
      { wide: true }
    );
    var head = GuiUI.el("div", "gui-page-head");
    var add = GuiUI.el("button", "gui-btn gui-btn-primary", "New check");
    var list = GuiUI.el("div");

    head.appendChild(GuiUI.el("h3", null, "Checks of this board"));
    head.appendChild(add);
    m.body.appendChild(head);
    m.body.appendChild(list);

    function boardChecks() {
      return state.checks.filter(function (c) {
        return String(c.patch_id) === String(board.patch_id) &&
          Number(c.board_num) === Number(board.board_num);
      }).sort(function (a, b) {
        return String(b.check_date || "")
          .localeCompare(String(a.check_date || ""));
      });
    }

    function render() {
      list.innerHTML = "";
      list.appendChild(
        GuiUI.table(CHECK_COLS, boardChecks(), {
          empty: "This board has never been checked.",
          onRowClick: function (c) { openCheck(c, render); }
        })
      );
    }

    add.addEventListener("click", function () {
      openCheck(
        null,
        render,
        { patch_id: board.patch_id, board_num: board.board_num }
      );
    });

    render();

    // Re-render the board list when data changed under the modal.

    m.el.addEventListener("transitionend", function () {});
    return m;
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

  var OBS_COLS = [
    { key: "species", label: "Species" },
    { key: "count", label: "Count" },
    { key: "notes", label: "Notes" }
  ];

  function obsFields(lk) {
    return [
      {
        key: "species",
        label: "Species",
        type: "select",
        options: optionsFrom(lk.coverboard_species, "species", "label")
      },
      { key: "count", label: "Count", type: "number", required: true },
      { key: "notes", label: "Notes", type: "text" }
    ];
  }

  function openCheck(row, onChanged, seed) {
    var isNew = !row;

    function changed() {
      return loadChecks().then(function () {
        if (onChanged) onChanged();
      });
    }
    var m = GuiUI.modal(
      isNew ? "New coverboard check" : "Check — " + checkTitle(row),
      { wide: true }
    );

    // -- metadata -----------------------------------------------------------

    var head = GuiUI.el("div", "gui-page-head");

    head.appendChild(GuiUI.el("h3", null, "Check data"));

    var headBar = GuiUI.el("div", "gui-actions");
    var saveHead = GuiUI.el("button", "gui-btn gui-btn-primary",
      isNew ? "Save check" : "Save changes");

    headBar.appendChild(saveHead);

    if (!isNew) {
      var del = GuiUI.el("button", "gui-btn gui-btn-danger", "Delete");

      del.addEventListener("click", function () {
        GuiUI.confirm(
          "Delete this check and ALL of its observations? This cannot be " +
          "undone."
        ).then(function (ok) {
          if (!ok) return;

          return GuiApi.del(
            "/coverboard_checks/" + row.coverboard_check_id
          ).then(function () {
            m.close();
            GuiUI.status("Check deleted.", "ok");
            return changed();
          }).catch(function (e) {
            GuiUI.status("Delete failed: " + e.message, "err");
            if (window.console) console.error(e);
          });
        });
      });
      headBar.appendChild(del);
    }

    head.appendChild(headBar);
    m.body.appendChild(head);

    var seeded = { check_date: todayIso() };

    Object.keys(seed || {}).forEach(function (k) { seeded[k] = seed[k]; });

    var f = GuiUI.form(checkFields(refs.lk), row || seeded, "cb_hdr_");

    m.body.appendChild(f.el);

    saveHead.addEventListener("click", function () {
      saveHead.disabled = true;
      GuiUI.status("Saving…", "busy");

      var save = isNew
        ? GuiApi.post("/coverboard_checks", f.read())
        : GuiApi.patch(
            "/coverboard_checks/" + row.coverboard_check_id, f.read()
          );

      save.then(function (created) {
        GuiUI.status("Check saved.", "ok");

        if (isNew && created && created.coverboard_check_id) {
          row = created;
          isNew = false;
          saveHead.textContent = "Save changes";
          refreshObs();
        }
        return changed();
      }).catch(function (e) {
        GuiUI.status("Save failed: " + e.message, "err");
        if (window.console) console.error(e);
      }).then(function () {
        saveHead.disabled = false;
      });
    });

    // -- observations -------------------------------------------------------

    var obsPanel = GuiUI.el("div", "gui-subpanel");
    var ohead = GuiUI.el("div", "gui-page-head");
    var add = GuiUI.el("button", "gui-btn gui-btn-primary", "Add species");
    var list = GuiUI.el("div");

    ohead.appendChild(GuiUI.el("h3", null, "Observations"));
    ohead.appendChild(add);
    obsPanel.appendChild(ohead);
    obsPanel.appendChild(list);
    m.body.appendChild(obsPanel);

    function refreshObs() {
      if (!row) return Promise.resolve();

      return GuiApi.get(
        "/coverboard_checks/" + row.coverboard_check_id + "/obs"
      ).then(function (rows) {
        renderObs(rows || []);
      }).catch(function (e) {
        list.innerHTML = "";
        list.appendChild(GuiUI.el("p", "gui-empty",
          "Could not load observations: " + e.message));
        if (window.console) console.error(e);
      });
    }

    function renderObs(rows) {
      list.innerHTML = "";
      list.appendChild(
        GuiUI.table(OBS_COLS, rows, {
          empty: "No species recorded at this check.",
          rowTitle: function (r) {
            return "Observation — " + GuiUI.dash(r.species);
          },
          inlineEdit: {
            ask: false,
            fields: obsFields(refs.lk),
            onSave: function (r, values) {
              return GuiApi.patch("/coverboard_obs/" + r.obs_id, values)
                .then(function () {
                  GuiUI.status("Observation saved.", "ok");
                  return refreshObs();
                });
            },
            onDelete: function (r) {
              GuiUI.confirm("Delete this observation?").then(function (ok) {
                if (!ok) return;

                return GuiApi.del("/coverboard_obs/" + r.obs_id)
                  .then(function () {
                    GuiUI.status("Observation deleted.", "ok");
                    return refreshObs();
                  })
                  .catch(function (e) {
                    GuiUI.status("Delete failed: " + e.message, "err");
                    if (window.console) console.error(e);
                  });
              });
            }
          }
        })
      );
    }

    add.addEventListener("click", function () {
      if (!row) {
        GuiUI.status("Save the check first.", "err");
        return;
      }

      var of = GuiUI.form(obsFields(refs.lk), {}, "cb_obs_");

      GuiUI.formModal("Add observation", of, function (values) {
        return GuiApi.post(
          "/coverboard_checks/" + row.coverboard_check_id + "/obs", values
        ).then(function () {
          GuiUI.status("Observation saved.", "ok");
          return refreshObs();
        });
      });
    });

    if (isNew) {
      list.appendChild(GuiUI.el("p", "gui-empty",
        "Save the check first — observations attach to it."));
    } else {
      refreshObs();
    }

    f.focus();
  }

  // Lookup lists arrive as arrays of objects; tolerate a plain string array.

  function optionsFrom(list, valueKey, labelKey) {
    return (list || []).map(function (item) {
      if (typeof item === "string") return { value: item, label: item };
      return { value: item[valueKey], label: item[labelKey] || item[valueKey] };
    });
  }

  function field(labelText, input, id) {
    var row = GuiUI.el("div", "gui-field");
    var lab = GuiUI.el("label", "gui-label", labelText);

    lab.setAttribute("for", id);
    input.id = id;
    input.className = "gui-input";
    row.appendChild(lab);
    row.appendChild(input);
    return row;
  }

  function buildFilters(host, lk) {
    var bar = GuiUI.el("div", "gui-form");
    var patch = GuiUI.el("select");

    [{ value: "", label: "All patches" }]
      .concat(optionsFrom(lk.patches, "patch_id", "label"))
      .forEach(function (o) {
        var opt = GuiUI.el("option", null, o.label);

        opt.value = o.value;
        patch.appendChild(opt);
      });

    patch.addEventListener("change", function () {
      state.patch = patch.value;
      renderBoards();
    });

    bar.appendChild(field("Patch", patch, "cbFilterPatch"));
    host.appendChild(bar);
  }

  // ---- mount ---------------------------------------------------------------

  GuiPages.register({
    id: "coverboards",
    label: "Coverboards",
    mount: function (host) {
      var head = GuiUI.el("div", "gui-page-head");

      head.appendChild(GuiUI.el("h2", null, "Coverboards"));
      head.appendChild(GuiUI.el("p", "gui-empty",
        "Click a board to see its checks and add new ones."));
      host.appendChild(head);

      var filters = GuiUI.el("div", "gui-card");

      host.appendChild(filters);

      refs.checkList = GuiUI.el("div", "gui-scroll");
      host.appendChild(refs.checkList);

      GuiApi.lookups().then(function (lk) {
        refs.lk = lk;
        buildFilters(filters, lk);
        return loadChecks();
      });
    }
  });
})();
