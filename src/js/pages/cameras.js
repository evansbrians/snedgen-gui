// cameras.js -- predator cameras + their maintenance log.
//
// predator_camera is the parent; camera_maintenance rows are its children,
// ON DELETE CASCADE. The parent key is a TEXT id a human types
// ('coyote_trailcam_1'), so create must collect it.
//
// Interaction: a patch dropdown subsets the list (alphabetical by camera
// id). Clicking a camera opens ONE wide modal: the camera's data (patch)
// on top, its full maintenance log below -- no extra button presses.
"use strict";

(function () {
  var state = { cameras: [], patch: "" };
  var refs = {};

  // ---- data ----------------------------------------------------------------

  function loadCameras() {
    GuiUI.status("Loading cameras…", "busy");

    return GuiApi.get("/predator_cameras").then(function (rows) {
      state.cameras = (rows || []).slice().sort(function (a, b) {
        return String(a.camera_id).localeCompare(String(b.camera_id));
      });
      GuiUI.status("");
      renderCameras();
    }).catch(function (e) {
      GuiUI.status("Could not load cameras: " + e.message, "err");
      if (window.console) console.error(e);
    });
  }

  function visibleCameras() {
    if (!state.patch) return state.cameras;
    return state.cameras.filter(function (c) {
      return c.patch_id === state.patch;
    });
  }

  // ---- cameras (parent) ----------------------------------------------------

  function yesNo(v) {
    if (v === null || v === undefined || v === "") return "—";
    return (v === true || Number(v) === 1) ? "Yes" : "No";
  }

  var CAMERA_COLS = [
    { key: "camera_id", label: "Camera" },
    { key: "patch_id", label: "Patch" },
    { key: "last_maintenance", label: "Last service" },
    { key: "install", label: "Install", format: yesNo },
    { key: "replace_sd", label: "SD", format: yesNo },
    { key: "replace_batteries", label: "Batteries", format: yesNo },
    { key: "notes", label: "Last notes" }
  ];

  function cameraFields(lk, isNew) {
    var fields = [];

    if (isNew) {
      fields.push({
        key: "camera_id",
        label: "Camera id",
        type: "text",
        required: true,
        placeholder: "coyote_trailcam_1"
      });
    }

    fields.push({
      key: "patch_id",
      label: "Patch",
      type: "select",
      options: optionsFrom(lk.patches, "patch_id", "label")
    });

    return fields;
  }

  function renderCameras() {
    refs.cameraList.innerHTML = "";
    refs.cameraList.appendChild(
      GuiUI.table(CAMERA_COLS, visibleCameras(), {
        empty: "No cameras match this filter.",
        onRowClick: function (row) { openCamera(row); }
      })
    );
  }

  function newCamera(lk) {
    var f = GuiUI.form(cameraFields(lk, true), {}, "cam_new_");

    GuiUI.formModal("New camera", f, function (values) {
      if (!values.camera_id) {
        return Promise.reject(new Error("A camera id is required."));
      }

      return GuiApi.post("/predator_cameras", values)
        .then(function (created) {
          GuiUI.status("Camera saved.", "ok");
          return loadCameras().then(function () {
            openCamera(created && created.camera_id ? created : values);
          });
        }).catch(function (e) {
          throw idError(e, values.camera_id);
        });
    });
  }

  // A duplicate camera_id comes back as a rejected write, not a silent
  // no-op. Say which id clashed; the raw constraint text tells Tara nothing.

  function idError(e, cameraId) {
    if (window.console) console.error(e);

    var dup = e.status === 409 || e.status === 400 ||
      /UNIQUE|constraint|exists/i.test(String(e.message));

    if (dup) {
      return new Error(
        "Camera id \"" + cameraId + "\" was rejected — it may already " +
        "exist. Pick a different id. (" + e.message + ")"
      );
    }
    return e;
  }

  // ---- the combined modal --------------------------------------------------

  var LOG_COLS = [
    { key: "event_date", label: "Date" },
    { key: "install", label: "Install", format: yesNo },
    { key: "replace_sd", label: "SD", format: yesNo },
    { key: "replace_batteries", label: "Batteries", format: yesNo },
    { key: "notes", label: "Notes" }
  ];

  function logFields() {
    return [
      { key: "event_date", label: "Date", type: "date", required: true },
      { key: "install", label: "Installed", type: "checkbox" },
      { key: "replace_sd", label: "Replaced SD card", type: "checkbox" },
      {
        key: "replace_batteries",
        label: "Replaced batteries",
        type: "checkbox"
      },
      { key: "notes", label: "Notes", type: "text" }
    ];
  }

  // The two flag columns travel as 1/0 INTEGER, not booleans.

  function logBody(values) {
    ["install", "replace_sd", "replace_batteries"].forEach(function (k) {
      if (values[k] !== undefined) values[k] = values[k] ? 1 : 0;
    });
    return values;
  }

  function openCamera(camera) {
    var id = camera.camera_id;
    var m = GuiUI.modal("Camera — " + GuiUI.dash(id), { wide: true });

    // -- camera data (patch is the one editable field) ----------------------

    var head = GuiUI.el("div", "gui-page-head");

    head.appendChild(GuiUI.el("h3", null, "Camera data"));

    var headBar = GuiUI.el("div", "gui-actions");
    var saveHead = GuiUI.el("button", "gui-btn gui-btn-primary",
      "Save changes");
    var del = GuiUI.el("button", "gui-btn gui-btn-danger", "Delete camera");

    headBar.appendChild(saveHead);
    headBar.appendChild(del);
    head.appendChild(headBar);
    m.body.appendChild(head);

    var f = GuiUI.form(cameraFields(refs.lk, false), camera, "cam_edit_");

    m.body.appendChild(f.el);

    saveHead.addEventListener("click", function () {
      saveHead.disabled = true;
      GuiUI.status("Saving…", "busy");

      GuiApi.patch(
        "/predator_cameras/" + encodeURIComponent(id), f.read()
      ).then(function () {
        GuiUI.status("Camera saved.", "ok");
        return loadCameras();
      }).catch(function (e) {
        GuiUI.status("Save failed: " + e.message, "err");
        if (window.console) console.error(e);
      }).then(function () {
        saveHead.disabled = false;
      });
    });

    del.addEventListener("click", function () {
      GuiUI.confirm(
        "Delete camera " + id + " and its ENTIRE maintenance log? " +
        "This cannot be undone."
      ).then(function (ok) {
        if (!ok) return;

        return GuiApi.del("/predator_cameras/" + encodeURIComponent(id))
          .then(function () {
            m.close();
            GuiUI.status("Camera deleted.", "ok");
            return loadCameras();
          })
          .catch(function (e) {
            GuiUI.status("Delete failed: " + e.message, "err");
            if (window.console) console.error(e);
          });
      });
    });

    // -- maintenance log, always visible ------------------------------------

    var logPanel = GuiUI.el("div", "gui-subpanel");
    var lhead = GuiUI.el("div", "gui-page-head");
    var add = GuiUI.el("button", "gui-btn gui-btn-primary",
      "Add maintenance");
    var list = GuiUI.el("div");

    lhead.appendChild(GuiUI.el("h3", null, "Maintenance log"));
    lhead.appendChild(add);
    logPanel.appendChild(lhead);
    logPanel.appendChild(list);
    m.body.appendChild(logPanel);

    function refresh() {
      return GuiApi.get(
        "/predator_cameras/" + encodeURIComponent(id) + "/maintenance"
      ).then(function (rows) {
        render(rows || []);
        loadCameras();
      }).catch(function (e) {
        list.innerHTML = "";
        list.appendChild(GuiUI.el("p", "gui-empty",
          "Could not load the log: " + e.message));
        if (window.console) console.error(e);
      });
    }

    function render(rows) {
      list.innerHTML = "";
      list.appendChild(
        GuiUI.table(LOG_COLS, rows, {
          empty: "No maintenance recorded for this camera.",
          rowTitle: function (r) {
            return "Maintenance — " + GuiUI.dash(r.event_date);
          },
          inlineEdit: {
            ask: false,
            fields: logFields(),
            onSave: function (r, values) {
              return GuiApi.patch(
                "/camera_maintenance/" + r.maintenance_id, logBody(values)
              ).then(function () {
                GuiUI.status("Maintenance saved.", "ok");
                return refresh();
              });
            },
            onDelete: function (r) {
              GuiUI.confirm("Delete this maintenance record?")
                .then(function (ok) {
                  if (!ok) return;

                  return GuiApi.del(
                    "/camera_maintenance/" + r.maintenance_id
                  ).then(function () {
                    GuiUI.status("Maintenance deleted.", "ok");
                    return refresh();
                  }).catch(function (e) {
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
      var lf = GuiUI.form(logFields(), {}, "cam_log_");

      GuiUI.formModal("Add maintenance — " + id, lf, function (values) {
        return GuiApi.post(
          "/predator_cameras/" + encodeURIComponent(id) + "/maintenance",
          logBody(values)
        ).then(function () {
          GuiUI.status("Maintenance saved.", "ok");
          return refresh();
        });
      });
    });

    refresh();
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
      renderCameras();
    });

    bar.appendChild(field("Patch", patch, "camFilterPatch"));
    host.appendChild(bar);
  }

  // ---- mount ---------------------------------------------------------------

  GuiPages.register({
    id: "cameras",
    label: "Cameras",
    mount: function (host) {
      var head = GuiUI.el("div", "gui-page-head");

      head.appendChild(GuiUI.el("h2", null, "Predator cameras"));

      var add = GuiUI.el("button", "gui-btn gui-btn-primary", "New camera");

      head.appendChild(add);
      host.appendChild(head);

      var filters = GuiUI.el("div", "gui-card");

      host.appendChild(filters);

      refs.cameraList = GuiUI.el("div", "gui-scroll");
      host.appendChild(refs.cameraList);

      GuiApi.lookups().then(function (lk) {
        refs.lk = lk;
        buildFilters(filters, lk);
        add.addEventListener("click", function () { newCamera(lk); });
        return loadCameras();
      }).catch(function (e) {
        GuiUI.status("Could not load lookups: " + e.message, "err");
        if (window.console) console.error(e);
      });
    }
  });
})();
