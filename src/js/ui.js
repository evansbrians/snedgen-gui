// ui.js -- shared table / form / modal / status primitives.
//
// Every page builds from these so the pages look and behave like one app.
// No page writes its own table markup or inline styles.
//
// Interaction conventions (per Brian's review of v1):
// - Tables have CLICKABLE ROWS, not per-row Edit/Delete buttons. Clicking a
//   row opens a small popup (GuiUI.rowMenu) offering Modify / Delete / etc.
// - Edits happen IN PLACE: either the row's cells become inputs
//   (GuiUI.table's inlineEdit option) or a modal opens over the page
//   (GuiUI.modal). Nothing jumps to the top of the page.
"use strict";

(function () {
  function el(tag, cls, text) {
    var node = document.createElement(tag);

    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function dash(v) {
    return (v === null || v === undefined || v === "") ? "—" : String(v);
  }

  // ---- shared field/list helpers --------------------------------------------
  //
  // optionsFrom/withBlank/filterField/nestIdCompare used to be copy-pasted
  // into every page module (nests.js, gps_points.js, cameras.js, schedule.js,
  // summary.js, coverboards.js, visits.js, point_counts.js's near-identical
  // opts()) -- exactly the drift PAGE_CONTRACT.md warns pages away from.
  // Promoted here so there is one copy to fix.

  // Lookup lists arrive as arrays of objects; tolerate a plain string array.

  function optionsFrom(list, valueKey, labelKey) {
    return (list || []).map(function (item) {
      if (typeof item === "string") return { value: item, label: item };
      return {
        value: item[valueKey],
        label: item[labelKey] || item[valueKey]
      };
    });
  }

  // A nullable coded field needs an empty option: the form reads "" back as
  // null, which is how the API clears a column.

  function withBlank(options, blankLabel) {
    return [{ value: "", label: blankLabel || "—" }].concat(options || []);
  }

  // A labeled filter-bar control (label + input), used outside GuiUI.form
  // for the small filter rows above a page's table.

  function filterField(labelText, input, id) {
    var row = el("div", "gui-field");
    var lab = el("label", "gui-label", labelText);

    lab.setAttribute("for", id);
    input.id = id;
    input.className = "gui-input";
    row.appendChild(lab);
    row.appendChild(input);
    return row;
  }

  // Reverse alphabetical by id (newest numbers first), with the NQ group
  // pulled ahead of NSP and NLB -- the ordering nests.js and gps_points.js
  // both want for nest/point ids.

  function prefixRank(id) {
    var s = String(id || "");

    if (/^NQ/.test(s)) return 0;
    if (/^NSP/.test(s)) return 1;
    if (/^NLB/.test(s)) return 2;
    return 3;
  }

  function nestIdCompare(a, b) {
    var ra = prefixRank(a);
    var rb = prefixRank(b);

    if (ra !== rb) return ra - rb;
    return String(b || "").localeCompare(String(a || ""));
  }

  // A "does this look right" range check for a number field with fd.min /
  // fd.max -- NOT a hard block (a real value can legitimately fall
  // outside), just enough for a page to ask "are you sure?" before saving
  // an implausible entry. Returns a warning string, or null if v is fine
  // or fd has no range.

  function rangeWarning(fd, v) {
    if (fd.min === undefined && fd.max === undefined) return null;
    if (v === null || v === undefined || v === "") return null;

    var n = Number(v);

    if (isNaN(n)) return null;

    var unit = fd.unit ? " " + fd.unit : "";

    if (fd.min !== undefined && n < fd.min) {
      return n + " is below the typical " + fd.min + "-" + fd.max + unit +
        " range — save anyway?";
    }
    if (fd.max !== undefined && n > fd.max) {
      return n + " is above the typical " + fd.min + "-" + fd.max + unit +
        " range — save anyway?";
    }
    return null;
  }

  // ---- modal ---------------------------------------------------------------

  // Modals STACK: a row menu or confirm opened from inside a popup rides on
  // top of it, and closing returns to the one beneath. Esc and the backdrop
  // close the top-most only. Returns { el, body, close }.

  var modalStack = [];

  function modal(title, opts) {
    opts = opts || {};

    var backdrop = el("div", "gui-modal-backdrop");
    var box = el("div", "gui-modal" + (opts.wide ? " gui-modal-wide" : ""));
    var head = el("div", "gui-modal-head");
    var body = el("div", "gui-modal-body");
    var x = el("button", "gui-modal-x", "×");

    head.appendChild(el("h3", "gui-modal-title", title));
    x.title = "Close";
    head.appendChild(x);
    box.appendChild(head);
    box.appendChild(body);
    backdrop.appendChild(box);
    document.body.appendChild(backdrop);
    document.body.classList.add("gui-modal-open");

    function close(force) {
      // A guard (unsaved work) can veto every ordinary close -- Esc, the X,
      // the backdrop. Pass force=true to close regardless (e.g. after the
      // guard's own confirm, or after a successful save/delete).

      if (!force && opts.beforeClose && opts.beforeClose(handle) === false) {
        return;
      }

      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      document.removeEventListener("keydown", onKey);

      var i = modalStack.indexOf(handle);

      if (i > -1) modalStack.splice(i, 1);
      if (!modalStack.length) {
        document.body.classList.remove("gui-modal-open");
      }
      if (opts.onClose) opts.onClose();
    }

    function isTop() {
      return modalStack[modalStack.length - 1] === handle;
    }

    function onKey(e) {
      if (e.key === "Escape" && !opts.locked && isTop()) close();
    }

    // NOT `close` directly: the click event would land in close(force) and
    // read as force=true, skipping any beforeClose guard.

    x.addEventListener("click", function () { close(); });
    backdrop.addEventListener("click", function (e) {
      if (e.target === backdrop && !opts.locked) close();
    });
    document.addEventListener("keydown", onKey);

    var handle = { el: backdrop, box: box, body: body, close: close };

    modalStack.push(handle);
    return handle;
  }

  function closeModal() {
    if (modalStack.length) modalStack[modalStack.length - 1].close();
  }

  // Force every open modal shut, top of stack first. Used when the route
  // changes (a hash nav) so a popup never survives onto a page it no
  // longer belongs over -- see PAGE_CONTRACT.md's navigation note. This
  // bypasses beforeClose guards deliberately: a route change is the one
  // case where "the app looks frozen" outranks "warn about unsaved work."

  function closeAllModals() {
    while (modalStack.length) {
      modalStack[modalStack.length - 1].close(true);
    }
  }

  // ---- row menu ------------------------------------------------------------

  // The popup a clicked row opens: a title line and a short stack of actions.
  // actions: [{ label, kind ("primary"|"danger"|null), run() }]. Any action
  // closes the popup before it runs.

  function rowMenu(title, subtitle, actions) {
    var m = modal(title);

    if (subtitle) m.body.appendChild(el("p", "gui-modal-sub", subtitle));

    var stack = el("div", "gui-menu-stack");

    actions.forEach(function (a) {
      var cls = "gui-btn gui-btn-menu" +
        (a.kind === "primary" ? " gui-btn-primary" : "") +
        (a.kind === "danger" ? " gui-btn-danger" : "");
      var b = el("button", cls, a.label);

      b.addEventListener("click", function () {
        m.close();
        a.run();
      });
      stack.appendChild(b);
    });

    m.body.appendChild(stack);
    return m;
  }

  // ---- tables --------------------------------------------------------------

  // cols: [{ key, label, format(value, row), sortable, sortValue(row) }]
  // opts: {
  //   empty,
  //   onRowClick(row, tr),        -- row becomes clickable
  //   inlineEdit: {               -- clicking edits the row IN PLACE instead
  //     fields,                   -- form field defs, keyed like cols
  //     onSave(row, values),      -- promise; caller re-renders on resolve
  //     onDelete(row),            -- optional Delete button in the edit bar
  //     ask                       -- true: row click opens rowMenu first
  //   },
  //   rowTitle(row),              -- title for the inlineEdit rowMenu
  //   sortable: false             -- opt a whole table out of header sort
  // }

  // Generic, comparable-value sort: numeric when both sides parse as a
  // number, locale string compare otherwise, blanks always sort last
  // regardless of direction (a blank isn't meaningfully "low" or "high").

  function compareValues(a, b) {
    var aBlank = a === null || a === undefined || a === "";
    var bBlank = b === null || b === undefined || b === "";

    if (aBlank && bBlank) return 0;
    if (aBlank) return 1;
    if (bBlank) return -1;

    var an = Number(a);
    var bn = Number(b);

    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    return String(a).localeCompare(String(b));
  }

  function table(cols, rows, opts) {
    opts = opts || {};

    var wrap = el("div", "gui-table-wrap");

    if (!rows || !rows.length) {
      wrap.appendChild(el("p", "gui-empty", opts.empty || "Nothing here yet."));
      return wrap;
    }

    var t = el("table", "gui-table");
    var thead = el("thead");
    var hrow = el("tr");

    // No sortability cues used to exist anywhere in the app -- a table
    // rendered its rows in whatever order the caller passed and stayed
    // that way. Any column that isn't explicitly opted out (c.sortable
    // === false) is click-to-sort here, ascending first click, descending
    // second, with a ▲/▼ indicator on whichever column is currently
    // driving the order.

    var sort = { col: null, dir: 1 };
    var tbody = null;
    var ths = [];

    function sortedRows() {
      if (sort.col === null) return rows;

      var c = cols[sort.col];
      var val = c.sortValue || function (r) { return r[c.key]; };

      return rows.slice().sort(function (a, b) {
        return sort.dir * compareValues(val(a), val(b));
      });
    }

    function renderHeaders() {
      hrow.innerHTML = "";
      ths = [];

      cols.forEach(function (c, i) {
        var th = el("th");
        var sortable = opts.sortable !== false && c.sortable !== false;

        if (c.wrap) th.classList.add("gui-td-wrap");
        th.appendChild(el("span", null, c.label));

        if (sortable) {
          th.classList.add("gui-th-sortable");
          if (sort.col === i) {
            th.appendChild(el("span", "gui-sort-arrow",
              sort.dir === 1 ? " ▲" : " ▼"));
          }
          th.addEventListener("click", function () {
            sort.dir = (sort.col === i) ? -sort.dir : 1;
            sort.col = i;
            renderHeaders();
            renderBody();
          });
        }
        ths.push(th);
        hrow.appendChild(th);
      });
      if (opts.rowDelete) hrow.appendChild(el("th", null, ""));
    }

    function renderBody() {
      var fresh = el("tbody");

      sortedRows().forEach(function (row) {
        fresh.appendChild(dataRow(cols, row, opts));
      });

      if (tbody) t.replaceChild(fresh, tbody);
      else t.appendChild(fresh);
      tbody = fresh;
    }

    renderHeaders();
    thead.appendChild(hrow);
    t.appendChild(thead);
    renderBody();
    wrap.appendChild(t);
    return wrap;
  }

  function dataRow(cols, row, opts) {
    var tr = el("tr");
    var editing = false;

    cols.forEach(function (c) {
      var raw = row[c.key];
      var val = c.format ? c.format(raw, row) : dash(raw);
      var td = el("td", c.wrap ? "gui-td-wrap" : null, val);

      tr.appendChild(td);
    });

    // opts.rowDelete(row): an X at the row's end deletes it directly --
    // no menu in between. Out of the tab order, and its click never
    // triggers the row's own edit action.

    if (opts.rowDelete) {
      var dtd = el("td", "gui-row-actions");
      var db = el("button", "gui-btn gui-btn-sm gui-btn-danger gui-btn-x",
        "×");

      db.title = "Delete row";
      db.tabIndex = -1;
      db.addEventListener("click", function (e) {
        e.stopPropagation();
        opts.rowDelete(row);
      });
      dtd.appendChild(db);
      tr.appendChild(dtd);
    }

    var clickable = opts.onRowClick || opts.inlineEdit;

    if (clickable) {
      tr.className = "gui-row-click";
      tr.tabIndex = 0;
      tr.addEventListener("click", function () { activate(); });
      tr.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && e.target === tr) activate();
      });
    }

    function activate() {
      if (editing) return;

      if (opts.inlineEdit) {
        if (opts.inlineEdit.ask) {
          rowMenu(
            opts.rowTitle ? opts.rowTitle(row) : "Record",
            null,
            rowMenuActions()
          );
        } else {
          editRow();
        }
      } else if (opts.onRowClick) {
        opts.onRowClick(row, tr);
      }
    }

    function rowMenuActions() {
      var actions = [
        { label: "Modify", kind: "primary", run: editRow }
      ];

      if (opts.inlineEdit.onDelete) {
        actions.push({
          label: "Delete",
          kind: "danger",
          run: function () { opts.inlineEdit.onDelete(row); }
        });
      }
      return actions;
    }

    // The row's cells are swapped for inputs, in the row's own position; a
    // Save / Cancel bar rides in a slim row directly beneath it.

    function editRow() {
      var ie = opts.inlineEdit;
      var defsByKey = {};

      (ie.fields || []).forEach(function (f) { defsByKey[f.key] = f; });

      var inputs = {};
      var restore = [];

      editing = true;

      cols.forEach(function (c, i) {
        var td = tr.children[i];
        var def = defsByKey[c.key];

        if (!def) return;

        restore.push({ td: td, text: td.textContent });
        td.textContent = "";

        var input = makeInput(def, row[c.key]);

        input.classList.add("gui-cell");
        input.addEventListener("click", function (e) { e.stopPropagation(); });
        td.appendChild(input);
        inputs[c.key] = { input: input, def: def };
      });

      tr.classList.add("gui-row-editing");

      var barRow = el("tr", "gui-row-editbar");
      var barCell = el("td");

      barCell.colSpan = cols.length + (opts.rowDelete ? 1 : 0);

      var bar = el("div", "gui-actions gui-actions-inline");
      var ok = el("button", "gui-btn gui-btn-sm gui-btn-primary", "Save");
      var no = el("button", "gui-btn gui-btn-sm", "Cancel");

      bar.appendChild(ok);
      bar.appendChild(no);

      if (ie.onDelete) {
        var delBtn = el("button", "gui-btn gui-btn-sm gui-btn-danger",
          "Delete");

        delBtn.addEventListener("click", function () {
          cancel();
          ie.onDelete(row);
        });
        bar.appendChild(delBtn);
      }

      barCell.appendChild(bar);
      barRow.appendChild(barCell);
      tr.parentNode.insertBefore(barRow, tr.nextSibling);

      function cancel() {
        restore.forEach(function (r) { r.td.textContent = r.text; });
        tr.classList.remove("gui-row-editing");
        if (barRow.parentNode) barRow.parentNode.removeChild(barRow);
        editing = false;
      }

      ok.addEventListener("click", function () {
        ok.disabled = true;

        var values = {};

        Object.keys(inputs).forEach(function (k) {
          values[k] = readInput(inputs[k].input, inputs[k].def);
        });

        Promise.resolve().then(function () {
          return ie.onSave(row, values);
        }).catch(function (e) {
          status("Save failed: " + e.message, "err");
          if (window.console) console.error(e);
          ok.disabled = false;
        });
      });

      no.addEventListener("click", cancel);

      var firstKey = cols.map(function (c) { return c.key; })
        .filter(function (k) { return inputs[k]; })[0];

      if (firstKey) inputs[firstKey].input.focus();
    }

    return tr;
  }

  // ---- date + time cells ---------------------------------------------------

  // Everything in this study is ISO 8601 (yyyy-mm-dd) on a 24-hour clock.
  // Date and time fields are therefore plain validated TEXT cells -- the
  // browser's locale widgets (mm/dd/yyyy, AM/PM) never appear.

  function pad2(s) {
    s = String(s);
    return s.length < 2 ? "0" + s : s;
  }

  function normDate(v) {
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(v).trim());

    if (!m) return String(v).trim();
    return m[1] + "-" + pad2(m[2]) + "-" + pad2(m[3]);
  }

  function dateOk(v) {
    return /^\d{4}-\d{2}-\d{2}$/.test(v);
  }

  function normTime(v) {
    var s = String(v).trim();
    var m = /^(\d{1,2}):(\d{1,2})$/.exec(s);

    if (!m && /^\d{3,4}$/.test(s)) {
      m = [s, s.slice(0, s.length - 2), s.slice(-2)];
    }
    if (!m) return s;
    return pad2(m[1]) + ":" + pad2(m[2]);
  }

  function timeOk(v) {
    return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  }

  function flagFormat(input, ok) {
    var bad = input.value !== "" && !ok(input.value);

    input.classList.toggle("gui-cell-invalid", bad);
    input.title = bad ? "Not an allowed value" : "";
  }

  function wireDate(input) {
    input.addEventListener("change", function () {
      if (input.value) input.value = normDate(input.value);
      flagFormat(input, dateOk);
    });
  }

  function wireTime(input) {
    // The colon self-inserts between the second and third digit, so Tara
    // types "0605" and the cell reads 06:05.

    input.addEventListener("input", function () {
      if (/^\d{3,4}$/.test(input.value)) {
        input.value = input.value.slice(0, 2) + ":" + input.value.slice(2);
      }
    });
    input.addEventListener("change", function () {
      if (input.value) input.value = normTime(input.value);
      flagFormat(input, timeOk);
    });
  }

  // ---- inputs --------------------------------------------------------------

  function makeInput(fd, value) {
    var input;

    if (fd.type === "select") {
      input = el("select", "gui-input");
      (fd.options || []).forEach(function (o) {
        var opt = el("option", null, o.label);
        opt.value = o.value;
        input.appendChild(opt);
      });

      // Data-loss guard: if the stored value isn't one of the current
      // options (a lookup table has drifted from an older record), the
      // browser silently falls back to selecting the FIRST option -- and
      // an unmodified save then writes that blank/default value over the
      // real one. Instead, add the stale value as its own flagged option
      // so it round-trips unless someone deliberately picks something
      // else, and mark the field so it's visibly not a normal choice.

      if (value !== undefined && value !== null && value !== "") {
        var hasOpt = (fd.options || []).some(function (o) {
          return String(o.value) === String(value);
        });

        if (!hasOpt) {
          var stale = el("option", null, String(value) +
            " (not in current list — verify)");

          stale.value = String(value);
          input.insertBefore(stale, input.firstChild);
          input.classList.add("gui-input-stale");
          input.title = "Stored value \"" + value + "\" is not in the " +
            "current lookup list. Left as-is; change it deliberately if " +
            "it's wrong.";
        }
      }
    } else if (fd.type === "textarea") {
      input = el("textarea", "gui-input");
    } else {
      input = el("input", "gui-input");

      var t = fd.type || "text";

      if (t === "datalist") {
        input.type = "text";
        input.setAttribute("list", fd.listId);
      } else if (t === "date") {
        input.type = "text";
        input.placeholder = fd.placeholder || "yyyy-mm-dd";
        wireDate(input);
      } else if (t === "time") {
        input.type = "text";
        input.placeholder = fd.placeholder || "HH:MM";
        wireTime(input);
      } else {
        input.type = t;
      }

      // A "reasonable range" hint (e.g. nest height 0-30m), not a hard
      // HTML5 min/max block -- a real measurement can legitimately sit
      // outside it. Out-of-range flags the cell like an invalid select
      // value; rangeWarning() below is what a page uses at save time to
      // ask "are you sure?" instead of silently accepting a fat-fingered
      // "99".

      if (t === "number" && (fd.min !== undefined || fd.max !== undefined)) {
        input.addEventListener("change", function () {
          var bad = input.value !== "" &&
            rangeWarning(fd, input.value) !== null;

          input.classList.toggle("gui-input-warn", bad);
          input.title = bad
            ? rangeWarning(fd, input.value)
            : "";
        });
      }
    }

    if (fd.placeholder) input.placeholder = fd.placeholder;
    if (fd.required) input.required = true;

    if (fd.type === "checkbox") {
      input.checked = !!value && String(value) !== "0" &&
        String(value) !== "FALSE";
    } else if (value !== undefined && value !== null) {
      input.value = String(value);
    }
    return input;
  }

  function readInput(input, def) {
    if (def.type === "checkbox") return input.checked;

    if (def.type === "number") {
      return input.value === "" ? null : Number(input.value);
    }
    return input.value === "" ? null : input.value;
  }

  // ---- forms ---------------------------------------------------------------

  // fields: [{ key, label, type, options, required, placeholder, span }]
  //   type: text | number | date | time | select | textarea | checkbox
  // Returns { el, read(), focus() }.
  //
  // idPrefix namespaces the input ids so two forms over the same column do
  // not collide. span: "full" stretches a field across the grid row.

  function form(fields, values, idPrefix) {
    values = values || {};
    idPrefix = idPrefix || "f_";

    var f = el("div", "gui-form");
    var inputs = {};

    fields.forEach(function (fd) {
      var row = el("div", "gui-field" +
        (fd.span === "full" ? " gui-field-full" : ""));
      var lab = el("label", "gui-label", fd.label);
      var input = makeInput(fd, values[fd.key]);

      lab.setAttribute("for", idPrefix + fd.key);
      input.id = idPrefix + fd.key;
      inputs[fd.key] = { input: input, def: fd };

      row.appendChild(lab);
      row.appendChild(input);
      f.appendChild(row);
    });

    return {
      el: f,
      focus: function () {
        var first = fields[0];
        if (first && inputs[first.key]) inputs[first.key].input.focus();
      },
      read: function () {
        var out = {};

        Object.keys(inputs).forEach(function (k) {
          out[k] = readInput(inputs[k].input, inputs[k].def);
        });
        return out;
      }
    };
  }

  // A form inside a modal with Save / Cancel. save(values) returns a promise;
  // the modal closes when it resolves and shows the error when it rejects.

  function formModal(title, f, save, opts) {
    opts = opts || {};

    var m = modal(title, { wide: opts.wide });

    m.body.appendChild(f.el);

    var bar = el("div", "gui-actions");
    var ok = el("button", "gui-btn gui-btn-primary", opts.saveLabel || "Save");
    var no = el("button", "gui-btn", "Cancel");

    ok.addEventListener("click", function () {
      ok.disabled = true;
      status("Saving…", "busy");

      Promise.resolve().then(function () {
        return save(f.read());
      }).then(function () {
        m.close();
        status("Saved.", "ok");
      }).catch(function (e) {
        status("Save failed: " + e.message, "err");
        if (window.console) console.error(e);
      }).then(function () {
        ok.disabled = false;
      });
    });

    no.addEventListener("click", function () { m.close(); });

    bar.appendChild(ok);
    bar.appendChild(no);

    if (opts.extraActions) {
      opts.extraActions.forEach(function (a) {
        var b = el("button", "gui-btn" +
          (a.kind === "danger" ? " gui-btn-danger" : ""), a.label);

        b.addEventListener("click", function () { a.run(m); });
        bar.appendChild(b);
      });
    }

    m.body.appendChild(bar);
    f.focus();
    return m;
  }

  // ---- grid (spreadsheet editor) -------------------------------------------

  // A spreadsheet-shaped editor: every cell is live, the last row is always
  // blank so typing into it adds a row. Used by point counts (~21 rows per
  // count -- a form per row would be slower than the sheet it replaces).

  function grid(cols, initial, opts) {
    opts = opts || {};

    var data = (initial || []).map(function (r) { return copy(r); });
    var wrap = el("div", "gui-table-wrap");
    var t = el("table", "gui-table gui-grid");
    var tbody;
    var changed = null;

    function copy(o) {
      var out = {};
      Object.keys(o || {}).forEach(function (k) { out[k] = o[k]; });
      return out;
    }

    function isBlank(row) {
      return cols.every(function (c) {
        return row[c.key] === undefined || row[c.key] === null ||
               row[c.key] === "";
      });
    }

    function pad() {
      while (data.length && isBlank(data[data.length - 1])) data.pop();
      data.push({});
    }

    // Focus the input at (row r, column ci) in the CURRENT tbody -- render()
    // rebuilds it, so navigation always queries fresh DOM.

    function focusCell(r, ci) {
      var body = t.tBodies[0];

      if (!body || r < 0 || r >= body.rows.length) return;
      if (ci < 0 || ci >= cols.length) return;

      var cell = body.rows[r].cells[ci];
      var input = cell && cell.querySelector("input, select");

      if (!input) return;
      input.focus();
      if (input.select) {
        try { input.select(); } catch (e) {}
      }
    }

    // A freshly-typed row inherits opts.inherit columns (e.g. interval)
    // from the row above, exactly as those values repeat down her sheet.

    function applyInherit(row) {
      if (!opts.inherit || isBlank(row)) return;

      var i = data.indexOf(row);

      if (i <= 0) return;
      opts.inherit.forEach(function (k) {
        if ((row[k] === undefined || row[k] === null || row[k] === "") &&
            data[i - 1][k] !== undefined && data[i - 1][k] !== null &&
            data[i - 1][k] !== "") {
          row[k] = data[i - 1][k];
        }
      });
    }

    // Paste a block copied from a real spreadsheet: TSV rows fill from the
    // focused cell rightward and downward, growing the grid as needed.

    function pasteBlock(text, startRow, startCol) {
      var lines = String(text).replace(/\r/g, "").split("\n")
        .filter(function (l, i, arr) {
          return !(l === "" && i === arr.length - 1);
        });

      lines.forEach(function (line, dr) {
        var cells = line.split("\t");

        while (data.length <= startRow + dr) data.push({});

        var row = data[startRow + dr];

        cells.forEach(function (cell, dc) {
          var col = cols[startCol + dc];

          if (!col) return;

          var v = cell.trim();

          if (v === "") return;
          if (col.type === "number") {
            v = isNaN(Number(v)) ? null : Number(v);
          } else if (col.uppercase) {
            v = v.toUpperCase();
          }
          if (v !== null) row[col.key] = v;
        });
      });
      render();
      if (changed) changed(rowsOut());
      focusCell(startRow, startCol);
    }

    function cellInput(row, c, r, ci) {
      var input = makeInput(c, row[c.key]);

      input.className = "gui-cell";
      input.dataset.r = r;
      input.dataset.c = ci;

      // Validated cells, like a spreadsheet's data validation: an entry
      // that fails c.validate(v) stays visible but the cell flags red, and
      // the page's save-time check refuses to submit it.

      function markValidity(v) {
        var bad = c.validate &&
          v !== null && v !== undefined && v !== "" && !c.validate(v);

        input.classList.toggle("gui-cell-invalid", !!bad);
        input.title = bad ? "Not an allowed value" : "";
      }

      markValidity(row[c.key]);

      input.addEventListener("change", function () {
        var v = readInput(input, c);

        // Species codes: lower-case entry auto-fills as upper case.

        if (c.uppercase && typeof v === "string") {
          v = v.toUpperCase();
          input.value = v;
        }
        row[c.key] = v;
        markValidity(v);
        applyInherit(row);

        var last = data[data.length - 1];

        if (last && !isBlank(last)) render();
        if (changed) changed(rowsOut());
      });

      // Spreadsheet feel: focusing a cell selects its content, so typing
      // overwrites; Escape restores what was there before the edit.

      if (input.tagName === "INPUT") {
        input.addEventListener("focus", function () {
          try { input.select(); } catch (e) {}
        });
      }

      // Spreadsheet keys: Enter commits + moves DOWN, arrows move between
      // cells (Tab already moves right natively). Selects keep native
      // Up/Down (that's how their value changes) but Left/Right navigate;
      // text cells navigate horizontally only from the caret's edge, so
      // arrowing within a half-typed species code still works.

      input.addEventListener("keydown", function (e) {
        var rr = Number(input.dataset.r);
        var cc = Number(input.dataset.c);
        var isSelect = input.tagName === "SELECT";
        var isText = input.tagName === "INPUT" && input.type === "text";

        function go(nr, nc) {
          e.preventDefault();

          // Commit first: the change handler may append the blank row (or
          // rebuild the tbody), and the target cell must exist by the time
          // focus moves.

          input.dispatchEvent(new Event("change"));
          focusCell(nr, nc);
        }

        if (e.key === "Escape") {
          // Restore the cell only -- do NOT let Esc bubble on to close the
          // whole modal mid-edit.

          e.preventDefault();
          e.stopPropagation();

          var prev = row[c.key];

          input.value = (prev === undefined || prev === null)
            ? "" : String(prev);
          return;
        }

        // Tab is handled HERE, not left to the browser: a change can
        // rebuild the tbody, and native Tab would then walk off a detached
        // node to somewhere unpredictable. Wraps to the next / previous
        // row at the edges, like a spreadsheet.

        if (e.key === "Tab") {
          var nc = cc + (e.shiftKey ? -1 : 1);
          var nr = rr;

          if (nc >= cols.length) { nr = rr + 1; nc = 0; }
          if (nc < 0) { nr = rr - 1; nc = cols.length - 1; }
          go(nr, nc);
          return;
        }

        if (e.key === "Enter") {
          // From the LAST column, Enter starts the next row at its first
          // column -- finishing a line, spreadsheet-style. Elsewhere it
          // moves straight down.

          if (cc === cols.length - 1) go(rr + 1, 0);
          else go(rr + 1, cc);
        } else if (e.key === "ArrowDown" && !isSelect) {
          go(rr + 1, cc);
        } else if (e.key === "ArrowUp" && !isSelect) {
          go(rr - 1, cc);
        } else if (e.key === "ArrowRight") {
          if (isSelect) {
            go(rr, cc + 1);
          } else if (!isText ||
                     input.selectionEnd === input.value.length) {
            go(rr, cc + 1);
          }
        } else if (e.key === "ArrowLeft") {
          if (isSelect) {
            go(rr, cc - 1);
          } else if (!isText || input.selectionStart === 0) {
            go(rr, cc - 1);
          }
        }
      });
      return input;
    }

    function render() {
      pad();
      if (tbody) t.removeChild(tbody);
      tbody = el("tbody");

      data.forEach(function (row, i) {
        var tr = el("tr");

        if (i === data.length - 1) tr.className = "gui-grid-new";

        cols.forEach(function (c, ci) {
          var td = el("td");

          // Width lives on the CELL, the input fills it edge-to-edge --
          // clicking anywhere in a cell lands in its input.

          if (c.width) td.style.width = c.width;
          td.appendChild(cellInput(row, c, i, ci));
          tr.appendChild(td);
        });

        var td = el("td", "gui-row-actions");

        if (i < data.length - 1) {
          var d = el("button", "gui-btn gui-btn-sm gui-btn-danger gui-btn-x",
            "×");

          d.title = "Remove row";

          // Out of the tab order so Tab flows cell -> cell, not through
          // every remove button.

          d.tabIndex = -1;
          d.addEventListener("click", function () {
            data.splice(i, 1);
            render();
            if (changed) changed(rowsOut());
          });
          td.appendChild(d);
        }
        tr.appendChild(td);
        tbody.appendChild(tr);
      });
      t.appendChild(tbody);
    }

    function rowsOut() {
      return data.filter(function (r) { return !isBlank(r); })
                 .map(function (r) { return copy(r); });
    }

    var thead = el("thead");
    var hr = el("tr");

    cols.forEach(function (c) { hr.appendChild(el("th", null, c.label)); });
    hr.appendChild(el("th", null, ""));
    thead.appendChild(hr);
    t.appendChild(thead);
    render();
    wrap.appendChild(t);

    // Block paste, table-wide: a TSV block copied from a real spreadsheet
    // fills from whichever cell is focused (dropdown cells included).

    t.addEventListener("paste", function (e) {
      var a = document.activeElement;

      if (!a || a.dataset === undefined || a.dataset.r === undefined) return;

      var text = (e.clipboardData || window.clipboardData)
        .getData("text/plain");

      if (text && (text.indexOf("\t") > -1 || text.indexOf("\n") > -1)) {
        e.preventDefault();
        pasteBlock(text, Number(a.dataset.r), Number(a.dataset.c));
      }
    });

    return {
      el: wrap,
      rows: rowsOut,
      onChange: function (fn) { changed = fn; }
    };
  }

  // A shared <datalist> so a 198-species vocabulary is type-ahead, not a
  // 198-option dropdown.

  function datalist(id, options) {
    var dl = el("datalist");

    dl.id = id;
    options.forEach(function (o) {
      var op = el("option");
      op.value = o.value;
      op.label = o.label;
      op.textContent = o.label;   // shown + filtered by name in Chrome/Edge
      dl.appendChild(op);
    });
    return dl;
  }

  // ---- photos --------------------------------------------------------------

  // Wrap RAW base64 as a data URI -- but ONLY when it really looks like
  // base64 image data (the app's asDataUri guard). Some migrated points
  // carry a FILENAME in the photo field; wrapping that produced the broken
  // image icons. A non-base64 value returns null -> show no image.

  function asDataUri(photo) {
    if (!photo) return null;

    var s = String(photo).trim();

    if (!s) return null;
    if (/^data:image\//i.test(s)) return s;

    var clean = s.replace(/\s+/g, "");

    if (clean.length > 100 && /^[A-Za-z0-9+/=]+$/.test(clean)) {
      return "data:image/jpeg;base64," + clean;
    }
    return null;
  }

  // Full-size photo viewer: a stacked modal sized to 90% of the page in
  // whichever direction the photo needs. Clicking the image closes it.

  function photoViewer(src) {
    if (!src) return;

    var m = modal("Photo");

    m.box.classList.add("gui-photo-modal");

    var img = el("img", "gui-photo-full");

    img.src = src;
    img.addEventListener("click", function () { m.close(); });
    m.body.appendChild(img);
    return m;
  }

  // Make an <img> open the viewer on click.

  function zoomable(img) {
    img.classList.add("gui-zoomable");
    img.addEventListener("click", function (e) {
      e.stopPropagation();
      photoViewer(img.src);
    });
    return img;
  }

  // ---- mini map ------------------------------------------------------------

  // The nest-info-style mini map (Esri imagery, one fieldIcons marker,
  // zoom 18) shared by the nest and GPS-point popups. Pannable and
  // zoomable; onClick becomes an "Open in Map tab" button in the corner
  // (a whole-map click would fight panning). Returns the Leaflet map,
  // or null.

  function miniMap(host, lat, lng, iconId, onClick) {
    if (!window.L || lat === null || lat === undefined ||
        lng === null || lng === undefined) {
      host.appendChild(el("p", "gui-empty", "No GPS position recorded."));
      return null;
    }

    var mini = window.L.map(host, {
      attributionControl: false,
      zoomControl: true
    });

    window.L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/" +
        "World_Imagery/MapServer/tile/{z}/{y}/{x}",
      { maxZoom: 21, maxNativeZoom: 19 }
    ).addTo(mini);
    mini.setView([lat, lng], 18);

    var ic = (window.fieldIcons || {})[iconId];

    if (ic) {
      window.L.marker([lat, lng], {
        icon: window.L.icon({
          iconUrl: ic.iconUrl,
          iconSize: [ic.iconWidth, ic.iconHeight],
          iconAnchor: [ic.iconAnchorX, ic.iconAnchorY]
        }),
        interactive: false
      }).addTo(mini);
    } else {
      window.L.circleMarker([lat, lng], {
        radius: 7, color: "#136aec", weight: 2, fillColor: "#8ec5ff",
        fillOpacity: 0.9, interactive: false
      }).addTo(mini);
    }

    if (onClick) {
      var open = el("button", "gui-btn gui-btn-sm gui-minimap-open",
        "Open in Map tab");

      open.addEventListener("click", function (e) {
        e.stopPropagation();
        onClick();
      });
      host.appendChild(open);
    }

    setTimeout(function () {
      try { mini.invalidateSize(); } catch (e) {}
    }, 250);
    return mini;
  }

  // ---- status + confirm ----------------------------------------------------

  function status(msg, kind) {
    var bar = document.getElementById("guiStatus");

    if (bar) {
      bar.textContent = msg || "";
      bar.className = "gui-status" + (kind ? " gui-status-" + kind : "");
    }

    // The status bar sits in the page header, BEHIND any open modal
    // (backdrop z-index 5000 vs header z-index 50) -- so a save made from
    // inside a popup produced a status line nobody could see. A toast rides
    // above the modal stack and self-dismisses, so "Saved." / an error is
    // visible whether or not a modal is open. "busy" is deliberately left
    // off the toast -- it is a transient state, not something worth a
    // popup, and would just flash before the ok/err toast replaces it.

    if (msg && (kind === "ok" || kind === "err")) toast(msg, kind);
  }

  var toastHost = null;

  function toast(msg, kind) {
    if (!toastHost) {
      toastHost = el("div", "gui-toast-host");
      document.body.appendChild(toastHost);
    }

    var t = el("div", "gui-toast" + (kind ? " gui-toast-" + kind : ""), msg);

    toastHost.appendChild(t);

    // Two rAFs so the "in" transition always runs (some browsers coalesce
    // a style change that happens in the same frame as the append).

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { t.classList.add("is-in"); });
    });

    setTimeout(function () {
      t.classList.remove("is-in");
      setTimeout(function () {
        if (t.parentNode) t.parentNode.removeChild(t);
      }, 220);
    }, 3200);
  }

  function confirmDialog(msg) {
    return new Promise(function (resolve) {
      var done = false;
      var m = modal("Please confirm", {
        onClose: function () {
          if (!done) resolve(false);
        }
      });

      m.body.appendChild(el("p", "gui-modal-sub", msg));

      var bar = el("div", "gui-actions");
      var yes = el("button", "gui-btn gui-btn-danger", "Yes, do it");
      var no = el("button", "gui-btn", "Cancel");

      yes.addEventListener("click", function () {
        done = true;
        resolve(true);
        m.close();
      });
      no.addEventListener("click", function () { m.close(); });

      bar.appendChild(yes);
      bar.appendChild(no);
      m.body.appendChild(bar);
    });
  }

  window.GuiUI = {
    el: el,
    dash: dash,
    modal: modal,
    closeModal: closeModal,
    closeAllModals: closeAllModals,
    rowMenu: rowMenu,
    table: table,
    form: form,
    formModal: formModal,
    grid: grid,
    datalist: datalist,
    miniMap: miniMap,
    asDataUri: asDataUri,
    photoViewer: photoViewer,
    zoomable: zoomable,
    status: status,
    toast: toast,
    confirm: confirmDialog,
    optionsFrom: optionsFrom,
    withBlank: withBlank,
    filterField: filterField,
    nestIdCompare: nestIdCompare,
    rangeWarning: rangeWarning
  };
})();
