// nests.js -- review, MODIFY and (since v3) ADD nests. A nest added here has
// no GPS point yet -- the field app records that at the nest; the server
// allocates the nest id.
//
// Layout per Brian's review of v1:
// - First row is the patch dropdown (All patches default). The table shows
//   nest DISCOVERY data for the selected patch; interval checks do not load
//   until a nest is opened.
// - Clicking a nest row opens a popup with the discovery record and the
//   interval table. "Modify record" turns the discovery values into fields;
//   an interval row is modified or deleted by selecting the row.
"use strict";

(function () {
  var state = { nests: [], intervals: [], patch: "", q: "", current: false };

  // "Current": fate is none of Unknown / Failure / Success.

  var CONCLUDED = ["Unknown", "Failure", "Success"];

  function isCurrent(n) {
    var fate = n.nest_fate;

    if (fate === null || fate === undefined || fate === "") return true;
    return CONCLUDED.indexOf(String(fate)) === -1;
  }
  var refs = {};

  // ---- data ----------------------------------------------------------------

  // Reverse alphabetical by nest id (newest N numbers first), with the NQ
  // group pulled ahead of NSP and NLB per Brian's spec -- shared with
  // gps_points.js as GuiUI.nestIdCompare.

  var nestOrder = GuiUI.nestIdCompare;

  function loadNests() {
    GuiUI.status("Loading nests…", "busy");

    // GET /nests calls its patch filter "patch", not "patch_id". There is no
    // server-side nest_id search, so that one is filtered here.

    var path = "/nests";

    if (state.patch) path += "?patch=" + encodeURIComponent(state.patch);

    return GuiApi.get(path).then(function (rows) {
      state.nests = (rows || []).slice().sort(function (a, b) {
        return nestOrder(a.nest_id, b.nest_id);
      });
      GuiUI.status("");
      renderNests();
    }).catch(function (e) {
      GuiUI.status("Could not load nests: " + e.message, "err");
      if (window.console) console.error(e);
    });
  }

  function loadIntervals(nestId) {
    return GuiApi.get("/nests/" + encodeURIComponent(nestId) + "/intervals")
      .then(function (rows) {
        state.intervals = rows || [];
        return state.intervals;
      });
  }

  // ---- discovery table -----------------------------------------------------

  function yesNo(v) {
    if (v === null || v === undefined || v === "") return "—";
    return (v === true || Number(v) === 1) ? "Yes" : "No";
  }

  var NEST_COLS = [
    { key: "nest_id", label: "Nest" },
    { key: "patch_id", label: "Patch" },
    { key: "species_common", label: "Species" },
    { key: "discovery_date", label: "Found" },
    { key: "discovery_stage", label: "Stage" },
    { key: "height_m", label: "Height (m)" },
    { key: "camera_or_control", label: "Camera" },
    { key: "artificial_candidate", label: "Artificial cand.", format: yesNo },
    { key: "substrates", label: "Substrates" },
    { key: "last_check", label: "Last check" },
    { key: "nest_fate", label: "Fate" },
    { key: "location_description", label: "Location", wrap: true }
  ];

  // Exactly the scalar fields PATCH /nests/<id> lists as editable, minus
  // gps_point_id: re-pointing a nest is a field act, at the point, not a
  // laptop text box. substrates are patchable but need a multi-select.

  function nestFields(lk) {
    return [
      {
        key: "patch_id",
        label: "Patch",
        type: "select",
        options: withBlank(optionsFrom(lk.patches, "patch_id", "label"))
      },
      {
        key: "species_code",
        label: "Species",
        type: "select",
        options: withBlank(optionsFrom(lk.species, "species_code",
          "common_name"))
      },
      { key: "species_other", label: "Species (other)", type: "text" },
      { key: "discovery_date", label: "Discovery date", type: "date" },
      {
        key: "discovery_stage",
        label: "Discovery stage",
        type: "select",
        options: withBlank(optionsFrom(lk.discovery_stage_codes, "code",
          "label"))
      },
      { key: "selfie_stick", label: "Selfie stick", type: "checkbox" },
      {
        key: "artificial_candidate",
        label: "Artificial nest candidate",
        type: "checkbox"
      },

      // camera_or_control and current_state are CHECK constraints on the
      // column, not code tables -- /lookups has nothing to serve for them.

      {
        key: "camera_or_control",
        label: "Camera or control",
        type: "select",
        options: withBlank([
          { value: "Camera", label: "Camera" },
          { value: "Control", label: "Control" }
        ])
      },
      {
        key: "camera_deployment_date",
        label: "Camera deployed",
        type: "date"
      },
      {
        key: "height_m",
        label: "Height (m)",
        type: "number",

        // Not a hard cap -- a real nest can sit outside this -- but
        // Boss and Lab Manager both typed "99" (meant as a fat-finger,
        // or a decimal-point slip) and had it save with no pushback at
        // all. 0-4m covers this study's shrub/understory nests; editDiscovery()
        // below asks "are you sure?" before saving anything outside it
        // instead of silently accepting it.

        min: 0,
        max: 4,
        unit: "m"
      },
      {
        key: "location_description",
        label: "Location description",
        type: "textarea",
        span: "full"
      },
      {
        key: "nest_fate",
        label: "Fate",
        type: "select",
        options: withBlank(optionsFrom(lk.nest_fate_codes, "code", "label"))
      },
      {
        key: "nest_fate_description",
        label: "Fate notes",
        type: "textarea",
        span: "full"
      }
    ];
  }

  function visibleNests() {
    var q = state.q.toLowerCase();

    return state.nests.filter(function (n) {
      if (state.current && !isCurrent(n)) return false;
      if (q &&
          String(n.nest_id || "").toLowerCase().indexOf(q) === -1) {
        return false;
      }
      return true;
    });
  }

  function renderNests() {
    refs.nestList.innerHTML = "";
    refs.nestList.appendChild(
      GuiUI.table(NEST_COLS, visibleNests(), {
        empty: "No nests match this filter.",
        onRowClick: function (row) { openNest(row); }
      })
    );
  }

  // Match the field app's payload exactly: the two flags travel as 1/0,
  // never true/false, because they are NOT NULL INTEGER columns.

  function nestBody(values) {
    values.selfie_stick = values.selfie_stick ? 1 : 0;
    values.artificial_candidate = values.artificial_candidate ? 1 : 0;
    return values;
  }

  // ---- the nest popup ------------------------------------------------------

  function openNest(row) {
    var m = GuiUI.modal("Nest " + GuiUI.dash(row.nest_id), { wide: true });
    var discHost = GuiUI.el("div");
    var locHost = GuiUI.el("div", "gui-subpanel");
    var intHost = GuiUI.el("div", "gui-subpanel");

    m.body.appendChild(discHost);
    m.body.appendChild(locHost);
    renderLocation();
    var ihead = GuiUI.el("div", "gui-page-head");
    var addCheck = GuiUI.el("button", "gui-btn gui-btn-primary",
      "Add interval check");

    ihead.appendChild(GuiUI.el("h3", null, "Interval checks"));
    ihead.appendChild(addCheck);
    intHost.appendChild(ihead);

    var intList = GuiUI.el("div");

    intHost.appendChild(intList);
    m.body.appendChild(intHost);

    addCheck.addEventListener("click", function () { newInterval(); });

    renderDiscovery();
    intList.appendChild(
      GuiUI.el("p", "gui-empty", "Loading interval checks…")
    );

    loadIntervals(row.nest_id).then(function () {
      renderIntervalTable();
    }).catch(function (e) {
      intList.innerHTML = "";
      intList.appendChild(
        GuiUI.el("p", "gui-empty", "Could not load checks: " + e.message)
      );
      if (window.console) console.error(e);
    });

    // Location + photo -- mirrors the app's nest-info screen: a static mini
    // map (Esri imagery, the nest's fieldIcons marker, zoom 18) beside the
    // GPS point's nav photo. Clicking the map jumps to the Map tab at zoom
    // 19 on this nest; Change photo replaces the point's nav photo.

    function renderLocation() {
      locHost.innerHTML = "";

      var head = GuiUI.el("div", "gui-page-head");

      head.appendChild(GuiUI.el("h3", null, "Location & photo"));
      locHost.appendChild(head);

      var rowEl = GuiUI.el("div", "gui-nestinfo-row");
      var mapBox = GuiUI.el("div", "gui-nestinfo-map");
      var photoBox = GuiUI.el("div", "gui-nestinfo-photo");

      rowEl.appendChild(mapBox);
      rowEl.appendChild(photoBox);
      locHost.appendChild(rowEl);
      photoBox.appendChild(GuiUI.el("p", "gui-empty", "Loading…"));

      GuiApi.get("/nests/" + encodeURIComponent(row.nest_id))
        .then(function (detail) {
          var gp = detail && detail.gps_point;
          var lat = gp && (gp.latitude !== undefined ? gp.latitude : gp.lat);
          var lng = gp &&
            (gp.longitude !== undefined ? gp.longitude : gp.lng);

          // The icon is whatever /map_points (v_map_point) assigned THIS
          // nest -- the same source the Map tab draws from, so the two can
          // never disagree. The heuristic below only covers a nest the
          // view has no row for.

          GuiApi.mapPoints().then(function (mps) {
            var hit = mps.filter(function (r2) {
              return r2.name === row.nest_id;
            })[0];

            var iconId = hit ? hit.icon
              : (row.nest_fate ? "nest_inactive"
                : (Number(row.artificial_candidate) === 1 &&
                   /^NQ/.test(row.nest_id)
                    ? "nest_artificial" : "nest_active"));

            GuiUI.miniMap(mapBox, lat, lng, iconId, function () {
              window.__guiMapFocus = { lat: lat, lng: lng, zoom: 19 };

              // Coming BACK to the Nests tab reopens this nest's popup.

              state.reopenNest = row.nest_id;
              m.close();
              location.hash = "map";
            });
          });
          buildPhoto(photoBox, gp, detail);
        })
        .catch(function (e) {
          photoBox.innerHTML = "";
          photoBox.appendChild(GuiUI.el("p", "gui-empty",
            "Could not load nest detail: " + e.message));
          if (window.console) console.error(e);
        });
    }

    // The photo can live in three places, checked in order: inline on the
    // gps point (nav_photo), behind the lazy per-point photo route, or as a
    // disk photo row (the app's larger uploads). Old/migrated nests use the
    // latter two, which is why "no photo" used to show for nests that
    // clearly have one in the app.

    function buildPhoto(host, gp, detail) {
      host.innerHTML = "";

      var placed = false;

      function place(src) {
        if (placed || !src) return false;
        placed = true;

        var img = GuiUI.el("img", "gui-nestinfo-photo-img");

        img.src = src;
        GuiUI.zoomable(img);
        host.insertBefore(img, host.firstChild);
        return true;
      }

      var asDataUri = GuiUI.asDataUri;

      if (!place(asDataUri(gp && gp.nav_photo))) {
        var lazy = (gp && gp.point_id)
          ? GuiApi.get("/gps_points/" + encodeURIComponent(gp.point_id) +
              "/photo").then(function (r) {
              return place(asDataUri(r && r.nav_photo));
            }).catch(function () { return false; })
          : Promise.resolve(false);

        lazy.then(function (ok) {
          if (ok) return true;

          var photos = (detail && detail.photos) || [];

          if (!photos.length || photos[0].photo_id === undefined) {
            return false;
          }
          return GuiApi.photoBlobUrl(photos[0].photo_id)
            .then(function (url) { return place(url); })
            .catch(function () { return false; });
        }).then(function (ok) {
          if (!ok && !placed) {
            host.insertBefore(
              GuiUI.el("p", "gui-empty",
                "No photo attached to this nest's point."),
              host.firstChild
            );
          }
        });
      }

      if (!gp || !gp.point_id) return;

      // Change photo: pick a file, ship it as base64 -> the point's
      // nav_photo (PATCH /gps_points/<id> accepts nav_photo).

      var bar = GuiUI.el("div", "gui-actions");
      var change = GuiUI.el("button", "gui-btn", "Change photo");
      var input = GuiUI.el("input");

      input.type = "file";
      input.accept = "image/*";
      input.style.display = "none";

      change.addEventListener("click", function () { input.click(); });

      input.addEventListener("change", function () {
        var file = input.files && input.files[0];

        if (!file) return;

        var reader = new FileReader();

        reader.onload = function () {
          GuiUI.status("Uploading photo…", "busy");
          GuiApi.patch(
            "/gps_points/" + encodeURIComponent(gp.point_id),
            { nav_photo: reader.result, nav_photo_name: file.name }
          ).then(function () {
            GuiUI.status("Photo updated.", "ok");
            renderLocation();
          }).catch(function (e) {
            GuiUI.status("Photo upload failed: " + e.message, "err");
            if (window.console) console.error(e);
          });
        };
        reader.readAsDataURL(file);
      });

      bar.appendChild(change);
      bar.appendChild(input);
      host.appendChild(bar);
    }

    // Discovery: read view + "Modify record". Modifying swaps the values
    // for a form IN THE SAME SPOT (nothing moves to the top of anything).

    // Discovery: clicking the row opens editing in place; Save / Cancel /
    // Delete record sit at the bottom of the form.

    function renderDiscovery() {
      discHost.innerHTML = "";

      var head = GuiUI.el("div", "gui-page-head");

      head.appendChild(GuiUI.el("h3", null, "Discovery data"));
      head.appendChild(GuiUI.el("p", "gui-empty", "Click the row to edit."));
      discHost.appendChild(head);
      discHost.appendChild(GuiUI.table(NEST_COLS, [row], {
        onRowClick: function () { editDiscovery(); }
      }));
    }

    function editDiscovery() {
      discHost.innerHTML = "";

      var head = GuiUI.el("div", "gui-page-head");

      head.appendChild(GuiUI.el("h3", null, "Discovery data — editing"));
      discHost.appendChild(head);

      var f = GuiUI.form(nestFields(refs.lk), row, "nest_");
      var bar = GuiUI.el("div", "gui-actions");
      var ok = GuiUI.el("button", "gui-btn gui-btn-primary", "Modify");
      var no = GuiUI.el("button", "gui-btn", "Cancel");
      var del = GuiUI.el("button", "gui-btn gui-btn-danger",
        "Delete record");

      ok.addEventListener("click", function () {
        var values = f.read();

        // A range warning (height_m outside 0-4m) asks "are you sure?"
        // instead of silently accepting it -- the exact "99" repro both
        // the Boss and the Lab Manager hit.

        var warn = GuiUI.rangeWarning(
          { min: 0, max: 4, unit: "m" }, values.height_m
        );

        (warn ? GuiUI.confirm(warn) : Promise.resolve(true))
          .then(function (proceed) {
            if (!proceed) return;
            saveDiscovery(values);
          });
      });

      function saveDiscovery(values) {
        ok.disabled = true;
        GuiUI.status("Saving…", "busy");

        GuiApi.patch(
          "/nests/" + encodeURIComponent(row.nest_id),
          nestBody(values)
        ).then(function () {
          GuiUI.status("Nest saved.", "ok");

          return loadNests().then(function () {
            var fresh = state.nests.filter(function (n) {
              return n.nest_id === row.nest_id;
            })[0];

            if (fresh) row = fresh;
            renderDiscovery();
          });
        }).catch(function (e) {
          GuiUI.status("Save failed: " + e.message, "err");
          if (window.console) console.error(e);
          ok.disabled = false;
        });
      }

      no.addEventListener("click", renderDiscovery);

      del.addEventListener("click", function () {
        GuiUI.confirm(
          "Delete nest " + GuiUI.dash(row.nest_id) + " and ALL of its " +
          "interval checks? This cannot be undone."
        ).then(function (yes) {
          if (!yes) return;

          return GuiApi.del("/nests/" + encodeURIComponent(row.nest_id))
            .then(function () {
              m.close();
              GuiUI.status("Nest deleted.", "ok");
              return loadNests();
            })
            .catch(function (e) {
              GuiUI.status("Delete failed: " + e.message, "err");
              if (window.console) console.error(e);
            });
        });
      });

      bar.appendChild(ok);
      bar.appendChild(no);
      bar.appendChild(del);
      discHost.appendChild(f.el);
      discHost.appendChild(bar);
      f.focus();
    }

    // Intervals: selecting a row offers Modify (in place) / Delete.

    var INTERVAL_COLS = [
      { key: "check_date", label: "Date" },
      { key: "check_time", label: "Time" },
      { key: "current_state", label: "State" },
      { key: "observer_id", label: "Observer" },
      { key: "adult_present", label: "Adult" },
      { key: "adult_activity", label: "Activity" },
      { key: "host_eggs", label: "Host eggs" },
      { key: "host_young", label: "Host young" },
      { key: "host_dead_young", label: "Host dead" },
      { key: "bhco_eggs", label: "BHCO eggs" },
      { key: "bhco_young", label: "BHCO young" },
      { key: "bhco_dead_young", label: "BHCO dead" },
      { key: "nest_status", label: "Status" },
      { key: "young_status", label: "Young" },
      { key: "notes", label: "Notes", wrap: true }
    ];

    function intervalFields(lk) {
      return [
        { key: "check_date", label: "Date", type: "date", required: true },
        { key: "check_time", label: "Time", type: "time" },
        {
          key: "current_state",
          label: "State",
          type: "select",
          options: [
            { value: "Active", label: "Active" },
            { value: "Empty", label: "Empty" }
          ]
        },
        {
          key: "observer_id",
          label: "Observer",
          type: "select",
          options: withBlank(optionsFrom(lk.observers, "observer_id",
            "full_name"))
        },
        {
          key: "adult_present",
          label: "Adult",
          type: "select",
          options: withBlank(optionsFrom(lk.adult_present_codes, "code",
            "label"))
        },
        {
          key: "adult_activity",
          label: "Activity",
          type: "select",
          options: withBlank(optionsFrom(lk.adult_activity_codes, "code",
            "label"))
        },
        { key: "host_eggs", label: "Host eggs", type: "number" },
        { key: "host_young", label: "Host young", type: "number" },
        { key: "host_dead_young", label: "Host dead", type: "number" },
        { key: "bhco_eggs", label: "BHCO eggs", type: "number" },
        { key: "bhco_young", label: "BHCO young", type: "number" },
        { key: "bhco_dead_young", label: "BHCO dead", type: "number" },
        {
          key: "nest_status",
          label: "Status",
          type: "select",
          options: withBlank(optionsFrom(lk.nest_status_codes, "code",
            "label"))
        },
        {
          key: "young_status",
          label: "Young",
          type: "select",
          options: withBlank(optionsFrom(lk.young_status_codes, "code",
            "label"))
        },
        { key: "notes", label: "Notes", type: "text" }
      ];
    }

    function renderIntervalTable() {
      intList.innerHTML = "";
      intList.appendChild(
        GuiUI.table(INTERVAL_COLS, state.intervals, {
          empty: "No interval checks recorded for this nest.",
          rowTitle: function (r) {
            return "Check — " + GuiUI.dash(r.check_date);
          },
          rowDelete: function (r) { deleteInterval(r); },
          inlineEdit: {
            ask: false,
            fields: intervalFields(refs.lk),
            onSave: function (r, values) {
              return GuiApi.patch(
                "/intervals/" + encodeURIComponent(r.check_id), values
              ).then(function () {
                GuiUI.status("Check saved.", "ok");
                return loadIntervals(row.nest_id).then(renderIntervalTable);
              });
            }
          }
        })
      );
    }

    function newInterval() {
      var f = GuiUI.form(intervalFields(refs.lk),
        { check_date: todayIso(), current_state: "Active" }, "int_new_");

      GuiUI.formModal("Add interval check — " + GuiUI.dash(row.nest_id), f,
        function (values) {
          return GuiApi.post(
            "/nests/" + encodeURIComponent(row.nest_id) + "/intervals",
            values
          ).then(function () {
            GuiUI.status("Check saved.", "ok");
            return loadIntervals(row.nest_id).then(renderIntervalTable);
          });
        });
    }

    function deleteInterval(r) {
      GuiUI.confirm(
        "Delete the " + GuiUI.dash(r.check_date) +
        " interval check? This cannot be undone."
      ).then(function (ok) {
        if (!ok) return;

        return GuiApi.del("/intervals/" + encodeURIComponent(r.check_id))
          .then(function () {
            GuiUI.status("Check deleted.", "ok");
            return loadIntervals(row.nest_id).then(renderIntervalTable);
          })
          .catch(function (e) {
            GuiUI.status("Delete failed: " + e.message, "err");
            if (window.console) console.error(e);
          });
      });
    }
  }

  // ---- add nest ------------------------------------------------------------

  // POST /nests: the server allocates the id (lowest free number under the
  // prefix). No GPS point from here -- pointing the nest is a field act.

  function newNest() {
    var fields = [
      {
        key: "prefix",
        label: "Id prefix",
        type: "select",
        options: [
          { value: "N", label: "N (natural)" },
          { value: "NQ", label: "NQ (artificial)" },
          { value: "NLB", label: "NLB (Long Branch)" },
          { value: "NSP", label: "NSP (Snedgen Park)" }
        ]
      }
    ].concat(nestFields(refs.lk));

    var f = GuiUI.form(fields, { discovery_date: todayIso() }, "nest_new_");

    GuiUI.formModal("Add nest", f, function (values) {
      return GuiApi.post("/nests", nestBody(values)).then(function (out) {
        var created = out && out.nest;
        var nid = created && created.length ? created[0].nest_id
          : (created && created.nest_id);

        GuiUI.status("Nest saved" + (nid ? " as " + nid : "") + ".", "ok");
        return loadNests();
      });
    }, { wide: true });
  }

  function todayIso() {
    var d = new Date();
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());

    if (m.length < 2) m = "0" + m;
    if (day.length < 2) day = "0" + day;
    return d.getFullYear() + "-" + m + "-" + day;
  }

  // ---- filters -------------------------------------------------------------

  var withBlank = GuiUI.withBlank;
  var optionsFrom = GuiUI.optionsFrom;
  var field = GuiUI.filterField;

  function buildFilters(host, lk) {
    var bar = GuiUI.el("div", "gui-form");
    var patch = GuiUI.el("select");
    var search = GuiUI.el("input");

    withBlank(optionsFrom(lk.patches, "patch_id", "label")).forEach(
      function (o) {
        var opt = GuiUI.el("option", null, o.value ? o.label : "All patches");

        opt.value = o.value;
        patch.appendChild(opt);
      }
    );

    patch.addEventListener("change", function () {
      state.patch = patch.value;
      loadNests();
    });

    search.type = "search";
    search.placeholder = "e.g. NQ04";
    search.addEventListener("input", function () {
      state.q = search.value.trim();
      renderNests();
    });

    bar.appendChild(field("Patch", patch, "nestsFilterPatch"));
    bar.appendChild(field("Nest id contains", search, "nestsFilterId"));

    // Current-nests switch: hide concluded nests (fate Unknown / Failure
    // / Success).

    var curRow = GuiUI.el("div", "gui-field");
    var curLab = GuiUI.el("label", "gui-label", "Current nests only");
    var curWrap = GuiUI.el("label", "gui-switch-inline");
    var cur = GuiUI.el("input");

    cur.type = "checkbox";
    cur.id = "nestsFilterCurrent";
    curLab.setAttribute("for", "nestsFilterCurrent");
    cur.addEventListener("change", function () {
      state.current = cur.checked;
      renderNests();
    });
    curWrap.appendChild(cur);
    curWrap.appendChild(GuiUI.el("span", null, "Current"));
    curRow.appendChild(curLab);
    curRow.appendChild(curWrap);
    bar.appendChild(curRow);
    host.appendChild(bar);
  }

  // ---- mount ---------------------------------------------------------------

  GuiPages.register({
    id: "nests",
    label: "Nests",
    mount: function (host) {
      var head = GuiUI.el("div", "gui-page-head");

      head.appendChild(GuiUI.el("h2", null, "Nests"));

      var add = GuiUI.el("button", "gui-btn gui-btn-primary", "Add nest");

      head.appendChild(add);
      host.appendChild(head);
      add.addEventListener("click", function () { newNest(); });

      var filters = GuiUI.el("div", "gui-card");

      host.appendChild(filters);

      refs.nestList = GuiUI.el("div", "gui-scroll");
      host.appendChild(refs.nestList);

      GuiApi.lookups().then(function (lk) {
        refs.lk = lk;
        buildFilters(filters, lk);
        return loadNests();
      }).catch(function (e) {
        GuiUI.status("Could not load lookups: " + e.message, "err");
        if (window.console) console.error(e);
      });
    },

    // Coming back from the Map tab: reopen the nest whose mini map was
    // clicked, so the round trip lands where it started.

    onShow: function () {
      if (!state.reopenNest) return;

      var id = state.reopenNest;

      state.reopenNest = null;

      var match = state.nests.filter(function (n) {
        return n.nest_id === id;
      })[0];

      if (match) openNest(match);
    }
  });
})();
