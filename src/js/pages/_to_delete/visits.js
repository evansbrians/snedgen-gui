// visits.js -- a visit: who went to which patch, on what day, to do what.
//
// Flat: a visit owns no children. The list shows ONE WEEK at a time (same
// prev / next bar as the schedule), with patch and activity dropdowns to
// subset it. Clicking a row opens the modify / delete popup.
"use strict";

(function () {
  var state = { weekStart: null, visits: [], patch: "", activity: "" };
  var refs = {};

  var MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct",
    "Nov", "Dec"
  ];

  // ---- dates ---------------------------------------------------------------

  function iso(d) {
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());

    if (m.length < 2) m = "0" + m;
    if (day.length < 2) day = "0" + day;
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function mondayOf(d) {
    var out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dow = (out.getDay() + 6) % 7;

    out.setDate(out.getDate() - dow);
    return out;
  }

  function addDays(d, n) {
    var out = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    out.setDate(out.getDate() + n);
    return out;
  }

  // Day before month, per the study's convention: "13 – 19 Jul, 2026".

  function dayMonth(d) {
    return d.getDate() + " " + MONTHS[d.getMonth()];
  }

  // ---- data ----------------------------------------------------------------

  function loadVisits() {
    var from = iso(state.weekStart);
    var to = iso(addDays(state.weekStart, 6));
    var path = "/visits?from=" + from + "&to=" + to;

    if (state.patch) path += "&patch_id=" + encodeURIComponent(state.patch);

    GuiUI.status("Loading visits…", "busy");

    return GuiApi.get(path).then(function (rows) {
      state.visits = rows || [];

      // First load with an empty current week: jump back to the newest week
      // that HAS visits, so the page never opens onto a blank table.

      if (!state.visits.length && !state.jumped && !state.patch) {
        state.jumped = true;

        return GuiApi.get("/visits").then(function (all) {
          var latest = null;

          (all || []).forEach(function (v) {
            if (v.visit_date && (!latest || v.visit_date > latest)) {
              latest = v.visit_date;
            }
          });

          if (latest) {
            var parts = latest.split("-");

            state.weekStart = mondayOf(new Date(
              Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])
            ));
            renderWeekBar();
            return loadVisits();
          }
          GuiUI.status("");
          renderActivityOptions();
          renderVisits();
        });
      }

      state.jumped = true;
      GuiUI.status("");
      renderActivityOptions();
      renderVisits();
    }).catch(function (e) {
      GuiUI.status("Could not load visits: " + e.message, "err");
      if (window.console) console.error(e);
    });
  }

  // activity is free TEXT with no /lookups list, so the dropdown offers the
  // distinct activities present in the loaded week.

  function renderActivityOptions() {
    var seen = {};
    var acts = [];

    state.visits.forEach(function (v) {
      var a = (v.activity || "").trim();

      if (a && !seen[a]) {
        seen[a] = true;
        acts.push(a);
      }
    });
    acts.sort();

    var sel = refs.activity;
    var current = state.activity;

    sel.innerHTML = "";

    var all = GuiUI.el("option", null, "All activities");

    all.value = "";
    sel.appendChild(all);
    acts.forEach(function (a) {
      var o = GuiUI.el("option", null, a);

      o.value = a;
      sel.appendChild(o);
    });

    if (current && seen[current]) {
      sel.value = current;
    } else {
      state.activity = "";
    }
  }

  function visibleVisits() {
    if (!state.activity) return state.visits;
    return state.visits.filter(function (v) {
      return (v.activity || "").trim() === state.activity;
    });
  }

  // ---- visits --------------------------------------------------------------

  var VISIT_COLS = [
    { key: "visit_date", label: "Date" },
    { key: "patch_id", label: "Patch" },
    { key: "helper", label: "Helper" },
    { key: "activity", label: "Activity" },
    { key: "status", label: "Status" },
    { key: "notes", label: "Notes" }
  ];

  function visitFields(lk) {
    return [
      { key: "visit_date", label: "Date", type: "date", required: true },
      {
        key: "patch_id",
        label: "Patch",
        type: "select",
        options: optionsFrom(lk.patches, "patch_id", "label")
      },
      { key: "helper", label: "Helper", type: "text" },
      { key: "activity", label: "Activity", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "notes", label: "Notes", type: "textarea", span: "full" }
    ];
  }

  function renderVisits() {
    refs.visitList.innerHTML = "";
    refs.visitList.appendChild(
      GuiUI.table(VISIT_COLS, visibleVisits(), {
        empty: "No visits match these filters.",
        onRowClick: function (row) { editVisit(row); }
      })
    );
  }

  function newVisit(lk) {
    // A new visit is usually logged the day it happened.

    var f = GuiUI.form(visitFields(lk), { visit_date: iso(new Date()) },
      "v_new_");

    GuiUI.formModal("New visit", f, function (values) {
      return GuiApi.post("/visits", values).then(function () {
        GuiUI.status("Visit saved.", "ok");
        return loadVisits();
      });
    });
  }

  function editVisit(row) {
    var f = GuiUI.form(visitFields(state.lookups), row, "v_edit_");

    GuiUI.formModal(
      "Modify visit — " + GuiUI.dash(row.visit_date), f,
      function (values) {
        return GuiApi.patch("/visits/" + row.visit_id, values)
          .then(function () {
            return loadVisits();
          });
      },
      {
        extraActions: [{
          label: "Delete",
          kind: "danger",
          run: function (m) {
            m.close();
            deleteVisit(row);
          }
        }]
      }
    );
  }

  function deleteVisit(row) {
    GuiUI.confirm("Delete this visit? This cannot be undone.")
      .then(function (ok) {
        if (!ok) return;

        return GuiApi.del("/visits/" + row.visit_id).then(function () {
          GuiUI.status("Visit deleted.", "ok");
          return loadVisits();
        }).catch(function (e) {
          GuiUI.status("Delete failed: " + e.message, "err");
          if (window.console) console.error(e);
        });
      });
  }

  // ---- week bar + filters --------------------------------------------------

  function weekLabel() {
    var mon = state.weekStart;
    var sun = addDays(mon, 6);
    var left = (mon.getMonth() === sun.getMonth())
      ? String(mon.getDate())
      : dayMonth(mon);

    return left + " – " + dayMonth(sun) + ", " + sun.getFullYear();
  }

  function renderWeekBar() {
    var bar = GuiUI.el("div", "gui-weekbar");
    var prev = GuiUI.el("button", "gui-btn", "‹ Previous");
    var label = GuiUI.el("span", "gui-week-label", weekLabel());
    var next = GuiUI.el("button", "gui-btn", "Next ›");
    var today = GuiUI.el("button", "gui-btn", "This week");

    prev.addEventListener("click", function () { shiftWeek(-7); });
    next.addEventListener("click", function () { shiftWeek(7); });
    today.addEventListener("click", function () {
      state.weekStart = mondayOf(new Date());
      renderWeekBar();
      loadVisits();
    });

    bar.appendChild(prev);
    bar.appendChild(label);
    bar.appendChild(next);
    bar.appendChild(today);

    refs.weekbar.innerHTML = "";
    refs.weekbar.appendChild(bar);
  }

  function shiftWeek(days) {
    state.weekStart = addDays(state.weekStart, days);
    renderWeekBar();
    loadVisits();
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
    var activity = GuiUI.el("select");

    [{ value: "", label: "All patches" }]
      .concat(optionsFrom(lk.patches, "patch_id", "label"))
      .forEach(function (o) {
        var opt = GuiUI.el("option", null, o.label);

        opt.value = o.value;
        patch.appendChild(opt);
      });

    patch.addEventListener("change", function () {
      state.patch = patch.value;
      loadVisits();
    });

    activity.addEventListener("change", function () {
      state.activity = activity.value;
      renderVisits();
    });

    refs.activity = activity;
    bar.appendChild(field("Patch", patch, "visitFilterPatch"));
    bar.appendChild(field("Activity", activity, "visitFilterActivity"));
    host.appendChild(bar);
  }

  // Lookup lists arrive as arrays of objects; tolerate a plain string array.

  function optionsFrom(list, valueKey, labelKey) {
    return (list || []).map(function (item) {
      if (typeof item === "string") return { value: item, label: item };
      return { value: item[valueKey], label: item[labelKey] || item[valueKey] };
    });
  }

  // ---- mount ---------------------------------------------------------------

  GuiPages.register({
    id: "visits",
    label: "Visits",
    mount: function (host) {
      var head = GuiUI.el("div", "gui-page-head");

      head.appendChild(GuiUI.el("h2", null, "Visits"));

      var add = GuiUI.el("button", "gui-btn gui-btn-primary", "New visit");

      head.appendChild(add);
      host.appendChild(head);

      refs.weekbar = GuiUI.el("div");
      host.appendChild(refs.weekbar);

      var filters = GuiUI.el("div", "gui-card");

      host.appendChild(filters);

      refs.visitList = GuiUI.el("div", "gui-scroll");
      host.appendChild(refs.visitList);

      state.weekStart = mondayOf(new Date());

      GuiApi.lookups().then(function (lk) {
        state.lookups = lk;
        add.addEventListener("click", function () { newVisit(lk); });
        buildFilters(filters, lk);
        renderWeekBar();
        return loadVisits();
      }).catch(function (e) {
        GuiUI.status("Could not load lookups: " + e.message, "err");
        if (window.console) console.error(e);
      });
    }
  });
})();
