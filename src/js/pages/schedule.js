// schedule.js -- the weekly field schedule, FIRST tab.
//
// One schedule_day row is a (date, patch_order) pair, so a field day is up to
// three rows. This page shows ONE WEEK at a time (prev / next, no date
// pickers) and renders each day's content in EXACTLY the field app's format
// (nestapi_schedule.js dayPanel: helper line, morning table, point-count
// table, nest-searching line + table, notes, weather) -- minus the
// accordions, since the whole week is on one page here.
//
// Day chrome kept from the v2 review: Field-day checkbox right after each
// title, Weather-day badge, Sunday hidden while Mon-Sat are all field days,
// one "Edit day" button (times / search-patch rows / Add patch / notes).
"use strict";

(function () {
  var state = { weekStart: null, rows: [], lookups: null, selfie: {} };
  var refs = {};

  var DAY_NAMES = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
    "Sunday"
  ];

  var MONTHS = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct",
    "Nov", "Dec"
  ];

  // Times were server-computed in v1 and read-only; they are editable in
  // Edit day (values still arrive from the jobs that fill them).

  var MAX_PATCH = 4;

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

  function shortDate(d) {
    return MONTHS[d.getMonth()] + " " + d.getDate();
  }

  // ---- data ----------------------------------------------------------------

  function loadWeek() {
    var from = iso(state.weekStart);
    var to = iso(addDays(state.weekStart, 6));

    GuiUI.status("Loading schedule…", "busy");

    return GuiApi.get(
      "/schedule_days?from=" + from + "&to=" + to
    ).then(function (rows) {
      state.rows = rows || [];
      GuiUI.status("");
      renderWeek();
    }).catch(function (e) {
      GuiUI.status("Could not load schedule: " + e.message, "err");
      if (window.console) console.error(e);
    });
  }

  // Selfie-stick nests get the giraffe mark on check_nests, exactly as the
  // field app's schedule does. One fetch per mount; refreshed with the week.

  function loadSelfieLookup() {
    return GuiApi.get("/nests").then(function (rows) {
      var out = {};

      (rows || []).forEach(function (n) {
        if (n && n.nest_id !== null && n.nest_id !== undefined &&
            (n.selfie_stick === 1 || n.selfie_stick === true)) {
          out[String(n.nest_id)] = true;
        }
      });
      state.selfie = out;
    }).catch(function (e) {
      if (window.console) console.error(e);
    });
  }

  function rowsFor(dateStr) {
    return state.rows.filter(function (r) {
      return r.date === dateStr;
    }).sort(function (a, b) {
      return (Number(a.patch_order) || 0) - (Number(b.patch_order) || 0);
    });
  }

  // field is TEXT 'TRUE'/'FALSE' in schema.sql, not a boolean.

  function isFieldDay(rows) {
    if (!rows.length) return true;
    return String(rows[0].field) === "TRUE";
  }

  // A day-level edit must reach every row of that date, one PATCH per id, in
  // series: a half-applied day is worse than a slow save.

  function patchEach(rows, body) {
    return rows.reduce(function (chain, row) {
      return chain.then(function () {
        return GuiApi.patch("/schedule_days/" + row.schedule_day_id, body);
      });
    }, Promise.resolve());
  }

  function delEach(rows) {
    return rows.reduce(function (chain, row) {
      return chain.then(function () {
        return GuiApi.del("/schedule_days/" + row.schedule_day_id);
      });
    }, Promise.resolve());
  }

  // ---- the app's day format (mirrors nestapi_schedule.js) ------------------

  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function dashV(v) {
    if (v === null || v === undefined) return "-";

    var s = String(v).trim();

    return s === "" ? "-" : s;
  }

  function isVal(v) {
    if (v === null || v === undefined) return false;

    var s = String(v).trim();

    return s !== "" && s !== "-";
  }

  function prettyPatch(v) {
    if (v === null || v === undefined) return "-";

    var s = String(v).replace(/_/g, " ").trim();

    if (s === "") return "-";
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }

  function morningTable(r) {
    return (
      '<table class="schedule-table morning-table">' +
      "<thead><tr>" +
      "<th>Home departure</th><th>Arrival</th><th>Sunrise</th>" +
      "<th>SCBI departure</th>" +
      "</tr></thead><tbody><tr>" +
      "<td>" + esc(dashV(r.departure_time)) + "</td>" +
      "<td>" + esc(dashV(r.arrive)) + "</td>" +
      "<td>" + esc(dashV(r.sunrise)) + "</td>" +
      "<td>" + esc(dashV(r.scbi_departure_time)) + "</td>" +
      "</tr></tbody></table>"
    );
  }

  function markCheckNests(v) {
    if (!isVal(v)) return dashV(v);

    return String(v)
      .split(",")
      .map(function (seg) {
        var s = seg.trim();

        if (s === "") return "";

        var m = /^(\S+)([\s\S]*)$/.exec(s);
        var id = m ? m[1] : s;
        var rest = m ? m[2] : "";

        return state.selfie[id] ? id + "🦒" + rest : s;
      })
      .filter(function (s) { return s !== ""; })
      .join(", ");
  }

  function predCountsTable(rows) {
    var body = rows
      .map(function (r) {
        return (
          "<tr>" +
          "<td>" + esc(dashV(r.point_count_time)) + "</td>" +
          "<td>" + esc(prettyPatch(r.patch_count)) + "</td>" +
          "<td>" + esc(dashV(r.boards)) + "</td>" +
          "<td>" + esc(markCheckNests(r.check_nests)) + "</td>" +
          "<td>" + esc(dashV(r.predator_cameras)) + "</td>" +
          "</tr>"
        );
      })
      .join("");

    return (
      '<table class="schedule-table">' +
      "<thead><tr>" +
      "<th>Time</th><th>Patch</th><th>Boards</th><th>Nests</th><th>Cams</th>" +
      "</tr></thead><tbody>" + body + "</tbody></table>"
    );
  }

  // Each search patch keeps its own TNS/helper activity (slot-bound). The GUI
  // supports up to four search patches; empty slots are skipped.

  function searchSlots(r) {
    var slots = [];

    for (var n = 1; n <= MAX_PATCH; n++) {
      slots.push({
        patch: r["search_patch_" + n],
        tns: r["tns_patch_" + n],
        help: r["helper_patch_" + n]
      });
    }
    return slots.filter(function (s) { return isVal(s.patch); });
  }

  function searchingLine(r) {
    var patches = searchSlots(r).map(function (s) {
      return prettyPatch(s.patch);
    });

    if (!patches.length) return "";
    return (
      "<p><strong>Nest searching: </strong>" +
      patches.map(esc).join(" → ") +
      "</p>"
    );
  }

  function searchingTable(r) {
    var slots = searchSlots(r);

    if (!slots.length) return "";

    var hasHelper = dashV(r.helper) !== "-";
    var rowsHtml = slots
      .map(function (s) {
        var patchCell =
          '<td class="sched-patch" rowspan="' +
          (hasHelper ? "2" : "1") +
          '">' + esc(prettyPatch(s.patch)) + "</td>";

        if (hasHelper) {
          return (
            "<tr>" + patchCell + "<td>TNS</td><td>" + esc(dashV(s.tns)) +
            "</td></tr>" +
            "<tr><td>" + esc(dashV(r.helper)) + "</td><td>" +
            esc(dashV(s.help)) + "</td></tr>"
          );
        }
        return (
          "<tr>" + patchCell + "<td>TNS</td><td>" + esc(dashV(s.tns)) +
          "</td></tr>"
        );
      })
      .join("");

    return (
      '<table class="schedule-table">' +
      "<thead><tr><th>Patch</th><th>Person</th><th>Activities</th></tr>" +
      "</thead><tbody>" + rowsHtml + "</tbody></table>"
    );
  }

  function noteList(notes) {
    if (!isVal(notes)) return "";

    var items = String(notes)
      .split("\n")
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s !== ""; })
      .map(function (s) { return "<li>" + esc(s) + "</li>"; })
      .join("");

    if (!items) return "";
    return (
      '<p><strong>Notes:</strong></p><ul class="schedule-notes">' + items +
      "</ul>"
    );
  }

  // Weather: narrative + summary always visible; the hourly table sits in a
  // native <details> (the app uses its accordion there, excluded here).

  function weatherSection(r) {
    if (!isVal(r.weather)) return "";

    var w;

    try {
      w = JSON.parse(r.weather);
    } catch (e) {
      return "";
    }

    var detailed = "";
    var summary = "";
    var hours;

    if (Array.isArray(w)) {
      hours = w;
    } else if (w && typeof w === "object") {
      detailed = w.detailed || "";
      summary = w.summary || "";
      hours = Array.isArray(w.hourly) ? w.hourly : [];
    } else {
      return "";
    }

    var head = "";

    if (isVal(detailed)) {
      head += "<p><strong>Weather: </strong>" + esc(detailed) + "</p>";
    }
    if (isVal(summary)) {
      head += '<p class="weather-summary">' + esc(summary) + "</p>";
    }

    var body = hours
      .map(function (h) {
        if (!h) return "";
        return (
          "<tr>" +
          "<td>" + esc(dashV(h.time)) + "</td>" +
          "<td>" + esc(dashV(h.forecast)) + "</td>" +
          "<td>" + esc(dashV(h.temp)) + "</td>" +
          "<td>" + esc(dashV(h.rain)) + "</td>" +
          "</tr>"
        );
      })
      .join("");

    var hourly = body
      ? "<details><summary>Hourly forecast</summary>" +
        '<table class="schedule-table">' +
        "<thead><tr><th>Time</th><th>Forecast</th><th>Temp</th><th>Rain</th>" +
        "</tr></thead><tbody>" + body + "</tbody></table></details>"
      : "";

    return head + hourly;
  }

  function dayBodyHtml(rows) {
    var r = rows[0];

    return (
      "<p><em>Helper: " + esc(dashV(r.helper)) + "</em></p>" +
      morningTable(r) +
      "<p><strong>Point count times, coverboards, and nests to check:" +
      "</strong></p>" +
      predCountsTable(rows) +
      searchingLine(r) +
      searchingTable(r) +
      noteList(r.notes) +
      weatherSection(r)
    );
  }

  // ---- week bar ------------------------------------------------------------

  function weekLabel() {
    var mon = state.weekStart;
    var sun = addDays(mon, 6);
    var lead = state.rows[0];
    var wk = lead && lead.week ? " · week " + lead.week : "";

    return shortDate(mon) + " – " + shortDate(sun) + ", " +
      sun.getFullYear() + wk;
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
      loadWeek();
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
    loadWeek();
  }

  // ---- day cards -----------------------------------------------------------

  function renderWeek() {
    renderWeekBar();
    refs.list.innerHTML = "";

    // Sunday hides while every Mon-Sat day is a field day (a day with no
    // rows counts as checked -- that is the default state).

    var allField = true;

    for (var i = 0; i < 6; i++) {
      if (!isFieldDay(rowsFor(iso(addDays(state.weekStart, i))))) {
        allField = false;
      }
    }

    for (var d = 0; d < 7; d++) {
      if (d === 6 && allField) continue;

      var date = addDays(state.weekStart, d);

      refs.list.appendChild(dayCard(date, DAY_NAMES[d]));
    }
  }

  function dayCard(date, dayName) {
    var dateStr = iso(date);
    var rows = rowsFor(dateStr);
    var field = isFieldDay(rows);
    var card = GuiUI.el("div", "gui-card gui-day-card");
    var head = GuiUI.el("div", "gui-day-head");

    head.appendChild(
      GuiUI.el("h3", "gui-day-title", dayName + " · " + shortDate(date))
    );

    // The Field-day checkbox rides right after the title. Without rows there
    // is nothing to write, so it waits for "Plan this day".

    var toggle = GuiUI.el("label", "gui-fieldtoggle");
    var cb = GuiUI.el("input");

    cb.type = "checkbox";
    cb.checked = field;
    cb.disabled = !rows.length;
    toggle.appendChild(cb);
    toggle.appendChild(GuiUI.el("span", null, "Field day"));
    head.appendChild(toggle);

    if (rows.length && !field) {
      head.appendChild(
        GuiUI.el("span", "gui-day-badge gui-day-badge-weather", "Weather day")
      );
    }

    cb.addEventListener("change", function () {
      var body = { field: cb.checked ? "TRUE" : "FALSE" };

      GuiUI.status("Saving…", "busy");
      patchEach(rows, body).then(function () {
        GuiUI.status("Day updated.", "ok");
        return loadWeek();
      }).catch(function (e) {
        GuiUI.status("Save failed: " + e.message, "err");
        if (window.console) console.error(e);
        loadWeek();
      });
    });

    var actions = GuiUI.el("div", "gui-actions");
    var edit = GuiUI.el("button", "gui-btn",
      rows.length ? "Edit day" : "Plan this day");

    edit.addEventListener("click", function () { editDay(dateStr, rows); });
    actions.appendChild(edit);
    head.appendChild(actions);
    card.appendChild(head);

    if (!rows.length) {
      card.appendChild(GuiUI.el("p", "gui-empty", "Nothing scheduled."));
      return card;
    }

    var bodyHost = GuiUI.el("div", "gui-day-body");

    bodyHost.innerHTML = dayBodyHtml(rows);
    card.appendChild(bodyHost);
    return card;
  }

  // ---- edit day ------------------------------------------------------------

  // Popup layout, per the spec:
  //   row 1: Helper, Arrive, Sunrise, Depart home, Depart SCBI, Point count
  //   row 2: Search patch 1, Tara tasks 1, Helper tasks 1
  //   row 3: Search patch 2, Tara tasks 2, Helper tasks 2
  //   row 4: [Add patch] -> reveals patch 3 (and again for patch 4)
  //   last : Notes

  function hasValue(v) {
    return v !== null && v !== undefined && v !== "" && v !== "-";
  }

  function editDay(dateStr, rows) {
    var lead = rows[0] || {};
    var lk = state.lookups;
    var m = GuiUI.modal("Edit day — " + dateStr, { wide: true });
    var forms = [];

    var timesForm = GuiUI.form([
      { key: "helper", label: "Helper", type: "text" },
      { key: "arrive", label: "Arrive", type: "time" },
      { key: "sunrise", label: "Sunrise", type: "time" },
      { key: "departure_time", label: "Depart home", type: "time" },
      { key: "scbi_departure_time", label: "Depart SCBI", type: "time" },
      { key: "point_count_time", label: "Point count", type: "time" }
    ], lead, "day_t_");

    timesForm.el.className = "gui-editday-times";
    m.body.appendChild(timesForm.el);
    forms.push(timesForm);

    var patchHost = GuiUI.el("div");

    m.body.appendChild(patchHost);

    var addBar = GuiUI.el("div", "gui-actions");
    var addBtn = GuiUI.el("button", "gui-btn", "Add patch");

    addBar.appendChild(addBtn);
    m.body.appendChild(addBar);

    var patchCount = 0;

    function addPatchRow() {
      patchCount += 1;

      var n = patchCount;
      var f = GuiUI.form([
        {
          key: "search_patch_" + n,
          label: "Search patch " + n,
          type: "select",
          options: patchOptions(lk)
        },
        {
          key: "tns_patch_" + n,
          label: "Tara tasks — patch " + n,
          type: "textarea"
        },
        {
          key: "helper_patch_" + n,
          label: "Helper tasks — patch " + n,
          type: "textarea"
        }
      ], lead, "day_p" + n + "_");

      f.el.className = "gui-editday-patch";
      patchHost.appendChild(f.el);
      forms.push(f);

      if (patchCount >= MAX_PATCH) addBtn.style.display = "none";
    }

    var startCount = 2;

    for (var n = 3; n <= MAX_PATCH; n++) {
      if (hasValue(lead["search_patch_" + n]) ||
          hasValue(lead["tns_patch_" + n]) ||
          hasValue(lead["helper_patch_" + n])) {
        startCount = n;
      }
    }

    while (patchCount < startCount) addPatchRow();
    addBtn.addEventListener("click", addPatchRow);

    var notesForm = GuiUI.form([
      { key: "notes", label: "Notes", type: "textarea", span: "full" }
    ], lead, "day_n_");

    m.body.appendChild(notesForm.el);
    forms.push(notesForm);

    var bar = GuiUI.el("div", "gui-actions");
    var ok = GuiUI.el("button", "gui-btn gui-btn-primary", "Save");
    var no = GuiUI.el("button", "gui-btn", "Cancel");

    ok.addEventListener("click", function () {
      ok.disabled = true;
      GuiUI.status("Saving…", "busy");

      var body = {};

      forms.forEach(function (f) {
        var values = f.read();

        Object.keys(values).forEach(function (k) { body[k] = values[k]; });
      });

      var save = rows.length
        ? patchEach(rows, body)
        : GuiApi.post("/schedule_days", merge(
            { date: dateStr, patch_order: 1, field: "TRUE" }, body
          ));

      save.then(function () {
        m.close();
        GuiUI.status("Day saved.", "ok");
        return loadWeek();
      }).catch(function (e) {
        GuiUI.status("Save failed: " + e.message, "err");
        if (window.console) console.error(e);
        ok.disabled = false;
      });
    });

    no.addEventListener("click", function () { m.close(); });
    bar.appendChild(ok);
    bar.appendChild(no);

    if (rows.length) {
      var del = GuiUI.el("button", "gui-btn gui-btn-danger", "Delete day");

      del.addEventListener("click", function () {
        GuiUI.confirm(
          "Delete ALL " + rows.length + " row(s) for " + dateStr +
          "? This cannot be undone."
        ).then(function (yes) {
          if (!yes) return;

          return delEach(rows).then(function () {
            m.close();
            GuiUI.status("Day deleted.", "ok");
            return loadWeek();
          }).catch(function (e) {
            GuiUI.status("Delete failed: " + e.message, "err");
            if (window.console) console.error(e);
          });
        });
      });
      bar.appendChild(del);
    }

    m.body.appendChild(bar);
    timesForm.focus();
  }

  function merge(target, src) {
    Object.keys(src || {}).forEach(function (k) { target[k] = src[k]; });
    return target;
  }

  // Patches come from /lookups. '' and '-' are the sheet's own sentinels for
  // "not set" and "deliberately nothing", and both survive into the column.

  function patchOptions(lk) {
    return [
      { value: "", label: "(none)" },
      { value: "-", label: "-" }
    ].concat(optionsFrom(lk.patches, "patch_id", "label"));
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
    id: "schedule",
    label: "Schedule",
    mount: function (host) {
      var head = GuiUI.el("div", "gui-page-head");

      head.appendChild(GuiUI.el("h2", null, "Field schedule"));
      host.appendChild(head);

      refs.weekbar = GuiUI.el("div");
      host.appendChild(refs.weekbar);

      refs.list = GuiUI.el("div");
      host.appendChild(refs.list);

      state.weekStart = mondayOf(new Date());

      GuiApi.lookups().then(function (lk) {
        state.lookups = lk;
        return loadSelfieLookup();
      }).then(function () {
        return loadWeek();
      }).catch(function (e) {
        GuiUI.status("Could not load lookups: " + e.message, "err");
        if (window.console) console.error(e);
      });
    }
  });
})();
