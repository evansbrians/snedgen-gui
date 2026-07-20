// gps_points.js -- review, MODIFY and DELETE GPS points (waypoints).
//
// Points are CREATED in the field, at the point -- this page cleans up
// names, classes and notes, and removes mistakes. Clicking a point opens a
// popup with the nest-info-style mini map, the point's photo, its details,
// and Modify / Delete. A point that carries a NEST (discovery / interval
// data) offers no Delete at all -- delete the nest first.
"use strict";

(function () {
  var state = { points: [], nestPoints: {}, cls: "", patch: "", q: "" };
  var refs = {};

  // Reverse alphabetical, with the NQ group ahead of NSP and NLB.

  function prefixRank(id) {
    var s = String(id || "");

    if (/^NQ/.test(s)) return 0;
    if (/^NSP/.test(s)) return 1;
    if (/^NLB/.test(s)) return 2;
    return 3;
  }

  function nestOrder(a, b) {
    var ra = prefixRank(a);
    var rb = prefixRank(b);

    if (ra !== rb) return ra - rb;
    return String(b || "").localeCompare(String(a || ""));
  }

  // ---- data ----------------------------------------------------------------

  function loadPoints() {
    GuiUI.status("Loading GPS points…", "busy");

    var points = GuiApi.get("/gps_points");
    var nests = GuiApi.get("/nests").catch(function () { return []; });

    return Promise.all([points, nests]).then(function (res) {
      state.points = ((res[0] && res[0].features) || [])
        .filter(function (f) {
          return f && f.geometry && f.geometry.coordinates &&
            f.geometry.coordinates.length >= 2;
        })
        .map(function (f) {
          var p = f.properties || {};

          return {
            point_id: p.point_id,
            point_name: p.point_name || p.name,
            point_class: p.point_class || p.class,
            patch_id: p.patch_id,
            latitude: f.geometry.coordinates[1],
            longitude: f.geometry.coordinates[0],
            horizontal_accuracy: p.horizontal_accuracy,
            elevation: p.elevation,
            bearing: p.bearing,
            n_samples: p.n_samples,
            datetime: p.datetime,
            note: p.note,
            has_nav_photo: !!p.has_nav_photo
          };
        });

      // Reverse alphabetical by name, NQ pulled ahead of NSP / NLB
      // (same ordering as the Nests page).

      state.points.sort(function (a, b) {
        return nestOrder(a.point_name, b.point_name);
      });

      // point_id -> [nest ids]: a point with a nest cannot be deleted here.

      state.nestPoints = {};
      (res[1] || []).forEach(function (n) {
        if (!n.gps_point_id) return;
        if (!state.nestPoints[n.gps_point_id]) {
          state.nestPoints[n.gps_point_id] = [];
        }
        state.nestPoints[n.gps_point_id].push(n.nest_id);
      });

      GuiUI.status("");
      renderPoints();
    }).catch(function (e) {
      GuiUI.status("Could not load GPS points: " + e.message, "err");
      if (window.console) console.error(e);
    });
  }

  function visiblePoints() {
    var q = state.q.toLowerCase();

    return state.points.filter(function (p) {
      if (state.cls && String(p.point_class) !== state.cls) return false;
      if (state.patch && String(p.patch_id) !== state.patch) return false;
      if (q && String(p.point_name || "").toLowerCase().indexOf(q) === -1) {
        return false;
      }
      return true;
    });
  }

  // ---- table ---------------------------------------------------------------

  function num(digits) {
    return function (v) {
      if (v === null || v === undefined || v === "") return "—";
      return Number(v).toFixed(digits);
    };
  }

  var POINT_COLS = [
    { key: "point_name", label: "Name" },
    { key: "point_class", label: "Class" },
    { key: "patch_id", label: "Patch" },
    { key: "latitude", label: "Latitude", format: num(6) },
    { key: "longitude", label: "Longitude", format: num(6) },
    { key: "horizontal_accuracy", label: "Accuracy (m)", format: num(1) },
    { key: "datetime", label: "Recorded" },
    { key: "note", label: "Note" }
  ];

  function pointFields(lk) {
    return [
      { key: "point_name", label: "Name", type: "text" },
      {
        key: "point_class",
        label: "Class",
        type: "select",
        options: optionsFrom(lk.point_classes, "code", "label")
      },
      {
        key: "patch_id",
        label: "Patch",
        type: "select",
        options: [{ value: "", label: "—" }].concat(
          optionsFrom(lk.patches, "patch_id", "label")
        )
      },
      { key: "note", label: "Note", type: "textarea", span: "full" }
    ];
  }

  function renderPoints() {
    refs.list.innerHTML = "";
    refs.list.appendChild(
      GuiUI.table(POINT_COLS, visiblePoints(), {
        empty: "No GPS points match these filters.",
        onRowClick: function (p) { openPoint(p); }
      })
    );
  }

  // ---- the point popup -----------------------------------------------------

  function iconIdFor(p) {
    var cls = String(p.point_class || "").toLowerCase();
    var m;

    if (cls === "nest") return "nest_active";
    if (cls === "coverboard") {
      m = /_cb_(\d+)/.exec(p.point_name || "");
      return m ? "cb_" + m[1] : "marker";
    }
    if (cls === "trailcam") {
      m = /_trailcam_(\d+)/.exec(p.point_name || "");
      return m ? "cam_" + m[1] : "marker";
    }
    if (cls === "point_count") return "pc";
    return "marker";
  }

  function openPoint(p) {
    var m = GuiUI.modal("Point " + GuiUI.dash(p.point_name), { wide: true });
    var rowEl = GuiUI.el("div", "gui-nestinfo-row");
    var mapBox = GuiUI.el("div", "gui-nestinfo-map");
    var photoBox = GuiUI.el("div", "gui-nestinfo-photo");
    var infoHost = GuiUI.el("div", "gui-subpanel");

    rowEl.appendChild(mapBox);
    rowEl.appendChild(photoBox);
    m.body.appendChild(rowEl);
    m.body.appendChild(infoHost);

    GuiUI.miniMap(mapBox, p.latitude, p.longitude, iconIdFor(p),
      function () {
        window.__guiMapFocus = {
          lat: p.latitude, lng: p.longitude, zoom: 19
        };
        m.close();
        location.hash = "map";
      });

    // Photo: lazy per-point fetch (the list is photo-free).

    photoBox.appendChild(GuiUI.el("p", "gui-empty", "Loading photo…"));
    GuiApi.get("/gps_points/" + encodeURIComponent(p.point_id) + "/photo")
      .then(function (r) {
        photoBox.innerHTML = "";

        var src = GuiUI.asDataUri(r && r.nav_photo);

        if (src) {
          var img = GuiUI.el("img", "gui-nestinfo-photo-img");

          img.src = src;
          GuiUI.zoomable(img);
          photoBox.appendChild(img);
        } else {
          photoBox.appendChild(GuiUI.el("p", "gui-empty",
            "No photo attached to this point."));
        }
      })
      .catch(function () {
        photoBox.innerHTML = "";
        photoBox.appendChild(GuiUI.el("p", "gui-empty",
          "No photo attached to this point."));
      });

    renderInfo();

    function renderInfo() {
      infoHost.innerHTML = "";

      var ul = GuiUI.el("ul", "gui-point-facts");

      [
        ["Class", p.point_class],
        ["Patch", p.patch_id],
        ["Latitude", p.latitude !== undefined
          ? Number(p.latitude).toFixed(6) : null],
        ["Longitude", p.longitude !== undefined
          ? Number(p.longitude).toFixed(6) : null],
        ["Accuracy (m)", p.horizontal_accuracy],
        ["Elevation (m)", p.elevation],
        ["Bearing", p.bearing],
        ["GPS samples", p.n_samples],
        ["Recorded", p.datetime],
        ["Note", p.note]
      ].forEach(function (pair) {
        if (pair[1] === null || pair[1] === undefined || pair[1] === "") {
          return;
        }

        var li = GuiUI.el("li");

        li.appendChild(GuiUI.el("strong", null, pair[0] + ": "));
        li.appendChild(GuiUI.el("span", null, String(pair[1])));
        ul.appendChild(li);
      });
      infoHost.appendChild(ul);

      var nests = state.nestPoints[p.point_id] || [];

      if (nests.length) {
        infoHost.appendChild(GuiUI.el("p", "gui-empty",
          "Nest data on this point: " + nests.join(", ") +
          " — delete the nest first if the point must go."));
      }

      var bar = GuiUI.el("div", "gui-actions");
      var modify = GuiUI.el("button", "gui-btn gui-btn-primary", "Modify");

      modify.addEventListener("click", editInfo);
      bar.appendChild(modify);

      // No Delete when a nest sits on this point (issue: discovery /
      // interval data would be destroyed with it).

      if (!nests.length) {
        var del = GuiUI.el("button", "gui-btn gui-btn-danger", "Delete");

        del.addEventListener("click", function () { deletePoint(p, m); });
        bar.appendChild(del);
      }
      infoHost.appendChild(bar);
    }

    function editInfo() {
      infoHost.innerHTML = "";

      var f = GuiUI.form(pointFields(refs.lk), p, "gps_edit_");
      var bar = GuiUI.el("div", "gui-actions");
      var ok = GuiUI.el("button", "gui-btn gui-btn-primary", "Save");
      var no = GuiUI.el("button", "gui-btn", "Cancel");

      ok.addEventListener("click", function () {
        ok.disabled = true;
        GuiUI.status("Saving…", "busy");

        GuiApi.patch(
          "/gps_points/" + encodeURIComponent(p.point_id), f.read()
        ).then(function () {
          GuiUI.status("Point saved.", "ok");

          return loadPoints().then(function () {
            var fresh = state.points.filter(function (q2) {
              return q2.point_id === p.point_id;
            })[0];

            if (fresh) p = fresh;
            renderInfo();
          });
        }).catch(function (e) {
          GuiUI.status("Save failed: " + e.message, "err");
          if (window.console) console.error(e);
          ok.disabled = false;
        });
      });

      no.addEventListener("click", renderInfo);
      bar.appendChild(ok);
      bar.appendChild(no);
      infoHost.appendChild(f.el);
      infoHost.appendChild(bar);
      f.focus();
    }
  }

  function deletePoint(p, modal) {
    GuiUI.confirm(
      "Delete point " + GuiUI.dash(p.point_name) +
      "? This cannot be undone."
    ).then(function (ok) {
      if (!ok) return;

      return GuiApi.del("/gps_points/" + encodeURIComponent(p.point_id))
        .then(function () {
          if (modal) modal.close();
          GuiUI.status("Point deleted.", "ok");
          return loadPoints();
        })
        .catch(function (e) {
          GuiUI.status("Delete failed: " + e.message, "err");
          if (window.console) console.error(e);
        });
    });
  }

  // ---- filters -------------------------------------------------------------

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
    var cls = GuiUI.el("select");
    var search = GuiUI.el("input");

    [{ value: "", label: "All patches" }]
      .concat(optionsFrom(lk.patches, "patch_id", "label"))
      .forEach(function (o) {
        var opt = GuiUI.el("option", null, o.label);

        opt.value = o.value;
        patch.appendChild(opt);
      });

    patch.addEventListener("change", function () {
      state.patch = patch.value;
      renderPoints();
    });

    [{ value: "", label: "All classes" }]
      .concat(optionsFrom(lk.point_classes, "code", "label"))
      .forEach(function (o) {
        var opt = GuiUI.el("option", null, o.label);

        opt.value = o.value;
        cls.appendChild(opt);
      });

    cls.addEventListener("change", function () {
      state.cls = cls.value;
      renderPoints();
    });

    search.type = "search";
    search.placeholder = "e.g. N060 or Big oak";
    search.addEventListener("input", function () {
      state.q = search.value.trim();
      renderPoints();
    });

    bar.appendChild(field("Patch", patch, "gpsFilterPatch"));
    bar.appendChild(field("Class", cls, "gpsFilterClass"));
    bar.appendChild(field("Name contains", search, "gpsFilterName"));
    host.appendChild(bar);
  }

  // ---- mount ---------------------------------------------------------------

  GuiPages.register({
    id: "gps_points",
    label: "GPS points",
    mount: function (host) {
      var head = GuiUI.el("div", "gui-page-head");

      head.appendChild(GuiUI.el("h2", null, "GPS points"));
      head.appendChild(
        GuiUI.el("p", "gui-empty",
          "Recorded in the field; cleaned up here. Click a point to open it.")
      );
      host.appendChild(head);

      var filters = GuiUI.el("div", "gui-card");

      host.appendChild(filters);

      refs.list = GuiUI.el("div");
      host.appendChild(refs.list);

      GuiApi.lookups().then(function (lk) {
        refs.lk = lk;
        buildFilters(filters, lk);
        return loadPoints();
      }).catch(function (e) {
        GuiUI.status("Could not load lookups: " + e.message, "err");
        if (window.console) console.error(e);
      });
    }
  });
})();
