// map.js -- the study map, LAST tab. Built to be IDENTICAL to the
// nest_app_api map, minus only (1) the elements tied to the user's live
// location (crosshairs, bearing, accuracy readouts, waypoint recording) and
// (2) the cog options button, which replaces the app's Map-options screen.
//
// Same pieces, referenced rather than re-invented:
// - window.fieldIcons  (src/data/field_icons.js, the app's inlined icon set;
//   FULL definitions: url + size + anchor, used with popup/tooltip anchors
//   exactly as nestapi_map.js computes them)
// - window.fieldPatches (src/data/field_patches.js, boundary polygons)
// - src/css/map_styles.css (the app's Leaflet styling)
// - GET /map_points (the v_map_point view: the DB decides icon / fades /
//   size for every marker, so this map and the app cannot drift)
//
// Layer stack, mirroring make_field_map.R's addLayersControl exactly:
//   base:     Satellite (Esri WorldImagery), Street Map (OSM)
//   overlays: Precipitation (NOAA WMS), NEXRAD (klwx radar), Patches,
//             Coverboards, Trail Cameras, Point Counts, Nests
//   (collapsed layers control, metric scale bar bottom-left, no attribution
//   control) -- so layers turn on and off exactly as in the app. Weather
//   overlays start OFF, everything else ON, matching the app's defaults.
"use strict";

(function () {
  var GROUPS = [
    "Patches",
    "Coverboards",
    "Trail Cameras",
    "Point Counts",
    "Nests"
  ];

  var state = {
    map: null,
    bases: {},
    overlays: {},         // name -> layerGroup / tileLayer
    waypoints: null,      // always-on, outside the control (as in the app)
    control: null,
    markers: [],          // [{ row, marker }]
    rows: [],
    options: {
      patch: "__all__",
      today: true
    }
  };

  var refs = {};

  // Zoom-driven icon scale, mirroring the app's scaleIconsForZoom:
  // s = clamp(1 - (19 - z) * 0.1, 0.1, 1).

  function zoomScale() {
    var z = state.map ? state.map.getZoom() : 19;

    return Math.min(1, Math.max(0.1, 1 - (19 - z) * 0.1));
  }

  function groupFor(cls) {
    if (cls === "nest") return "Nests";
    if (cls === "coverboard") return "Coverboards";
    if (cls === "trailcam") return "Trail Cameras";
    if (cls === "point_count") return "Point Counts";
    return null;
  }

  // ---- data ----------------------------------------------------------------

  function loadData() {
    GuiUI.status("Loading map…", "busy");

    return GuiApi.get("/map_points").then(function (rows) {
      state.rows = (rows || []).filter(function (r) {
        return r && r.lat !== null && r.lng !== null;
      });
      GuiUI.status("");
      redraw();
    }).catch(function (e) {
      if (window.console) console.error(e);
      return loadFallback();
    });
  }

  function loadFallback() {
    return GuiApi.get("/gps_points").then(function (fc) {
      state.rows = ((fc && fc.features) || []).filter(function (f) {
        return f && f.geometry && f.geometry.coordinates &&
          f.geometry.coordinates.length >= 2;
      }).map(function (f) {
        var p = f.properties || {};
        var name = p.point_name || p.name || "";
        var cls = String(p.point_class || p.class || "other").toLowerCase();

        return {
          name: name,
          class: cls,
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          icon: fallbackIcon(cls, name),
          is_current: 1,
          scheduled_today: 1,
          size: 1,
          note: p.note,
          idx: p.point_id
        };
      });
      GuiUI.status("");
      redraw();
    }).catch(function (e) {
      GuiUI.status("Could not load map data: " + e.message, "err");
      if (window.console) console.error(e);
    });
  }

  function fallbackIcon(cls, name) {
    var m;

    if (cls === "nest") return "nest_inactive";
    if (cls === "coverboard") {
      m = /_cb_(\d+)/.exec(name);
      return m ? "cb_" + m[1] : "marker";
    }
    if (cls === "trailcam") {
      m = /_trailcam_(\d+)/.exec(name);
      return m ? "cam_" + m[1] : "marker";
    }
    if (cls === "point_count") return "pc";
    return "marker";
  }

  // ---- icons (full definitions, as nestapi_map.js builds them) -------------

  function leafletIcon(row, zs) {
    var icons = window.fieldIcons || {};
    var ic = icons[row.icon];

    if (!ic) return null;

    var s = zs * (Number(row.size) || 1);
    var w = ic.iconWidth * s;
    var h = ic.iconHeight * s;

    return window.L.icon({
      iconUrl: ic.iconUrl,
      iconSize: [w, h],
      iconAnchor: [ic.iconAnchorX * s, ic.iconAnchorY * s],
      popupAnchor: [0, -h / 2],
      tooltipAnchor: [0, -h / 2]
    });
  }

  // ---- fades (exactly the app's two independent 0.5 fades) -----------------

  function rowOpacity(row) {
    var o = 1;

    if (Number(row.is_current) === 0) o = Math.min(o, 0.5);
    if (state.options.today && Number(row.scheduled_today) === 0 &&
        (row.class === "nest" || row.class === "coverboard" ||
         row.class === "trailcam")) {
      o = Math.min(o, 0.5);
    }
    return o;
  }

  // ---- geometry (patch subset) ---------------------------------------------

  function ringsOf(geom) {
    if (!geom || !geom.length) return [];
    if (typeof geom[0][0] === "number") return [geom];
    return geom;
  }

  function inRing(lat, lng, ring) {
    var inside = false;

    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var yi = ring[i][0];
      var xi = ring[i][1];
      var yj = ring[j][0];
      var xj = ring[j][1];
      var hit = ((yi > lat) !== (yj > lat)) &&
        (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);

      if (hit) inside = !inside;
    }
    return inside;
  }

  function inPatch(lat, lng, name) {
    var geom = (window.fieldPatches || {})[name];

    return ringsOf(geom).some(function (ring) {
      return inRing(lat, lng, ring);
    });
  }

  function rowVisible(row) {
    if (state.options.patch !== "__all__") {
      if (row.patch && row.patch === state.options.patch) return true;
      return inPatch(row.lat, row.lng, state.options.patch);
    }
    return true;
  }

  // ---- drawing -------------------------------------------------------------

  function redraw() {
    if (!state.map) return;

    GROUPS.concat(["__waypoints__"]).forEach(function (name) {
      var g = name === "__waypoints__"
        ? state.waypoints
        : state.overlays[name];

      if (g) g.clearLayers();
    });
    state.markers = [];

    drawPatches();

    var zs = zoomScale();

    state.rows.forEach(function (row) {
      if (!rowVisible(row)) return;

      var icon = leafletIcon(row, zs);
      var marker = icon
        ? window.L.marker([row.lat, row.lng], {
            icon: icon,
            opacity: rowOpacity(row)
          })
        : window.L.marker([row.lat, row.lng], {
            opacity: rowOpacity(row)
          });

      marker.bindPopup(popupFor(row));
      marker.on("popupopen", function (e) { lazyPopupPhoto(row, e.popup); });

      var groupName = groupFor(row.class);
      var group = groupName ? state.overlays[groupName] : state.waypoints;

      group.addLayer(marker);
      state.markers.push({ row: row, marker: marker });
    });

    // Paths and search tracks re-filter with the patch selection too.

    drawPaths();
    drawTracks();
  }

  // Patch polygons drawn EXACTLY as the app's map_weather.js renderShapes
  // does: white 20% fill, thin blue outline, popup + tooltip with the
  // pretty patch name -- and NO label markers.

  function drawPatches() {
    var all = Object.keys(window.fieldPatches || {});
    var names = (state.options.patch === "__all__")
      ? all
      : all.filter(function (n) { return n === state.options.patch; });
    var group = state.overlays.Patches;

    names.forEach(function (name) {
      var rings = window.fieldPatches[name];

      if (!rings || !rings.length) return;

      var poly = window.L.polygon(rings, {
        fillColor: "#ffffff",
        fillOpacity: 0.2,
        color: "#0000ff",
        weight: 1.5,
        opacity: 0.5
      });

      poly.bindPopup(pretty(name));
      poly.bindTooltip(pretty(name));
      group.addLayer(poly);
    });
  }

  // Garmin paths (window.fieldPaths), styled as the app styles them.
  // An overlay in the layers control, and SUBSET to the selected patch:
  // a path shows only when one of its (sampled) vertices falls inside
  // the selected boundary.

  function linesOf(path) {
    if (!path || !path.length) return [];
    if (typeof path[0][0] === "number") return [path];
    return path;
  }

  function anyVertexInPatch(lines, name) {
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var step = Math.max(1, Math.floor(line.length / 25));

      for (var j = 0; j < line.length; j += step) {
        if (inPatch(line[j][0], line[j][1], name)) return true;
      }
    }
    return false;
  }

  function drawPaths() {
    var group = state.overlays.Paths;

    if (!group) return;
    group.clearLayers();
    (window.fieldPaths || []).forEach(function (path) {
      var lines = linesOf(path);

      if (!lines.length) return;
      if (state.options.patch !== "__all__" &&
          !anyVertexInPatch(lines, state.options.patch)) {
        return;
      }
      group.addLayer(window.L.polyline(lines, {
        weight: 3,
        opacity: 0.7,
        dashArray: "2, 5",
        color: "#ffff00"
      }));
    });
  }

  // Search tracks (GET /tracks): walked search paths recorded by the
  // field app. Solid orange, so they read apart from the dashed yellow
  // Garmin paths. Subset by the track's own patch label, falling back to
  // geometry.

  function loadTracks() {
    return GuiApi.get("/tracks").then(function (rows) {
      state.tracks = rows || [];
      drawTracks();
    }).catch(function () {
      state.tracks = [];
    });
  }

  function drawTracks() {
    var group = state.overlays["Search tracks"];

    if (!group) return;
    group.clearLayers();
    (state.tracks || []).forEach(function (t) {
      var pts = (t.points || []).map(function (p) {
        return [p.lat, p.lng];
      }).filter(function (ll) {
        return typeof ll[0] === "number" && typeof ll[1] === "number";
      });

      if (pts.length < 2) return;
      if (state.options.patch !== "__all__" &&
          t.patch_id !== state.options.patch &&
          !anyVertexInPatch([pts], state.options.patch)) {
        return;
      }

      var line = window.L.polyline(pts, {
        weight: 3,
        opacity: 0.8,
        color: "#ff7f00"
      });

      line.bindPopup(
        GuiUI.dash(t.name) +
        (t.activity ? " — " + t.activity : "") +
        (t.created_at ? "<br>" + String(t.created_at).slice(0, 10) : "")
      );
      group.addLayer(line);
    });
  }

  // Re-scale icons with zoom, in lock-step with the field app.

  function onZoom() {
    var zs = zoomScale();

    state.markers.forEach(function (mk) {
      var icon = leafletIcon(mk.row, zs);

      if (icon) mk.marker.setIcon(icon);
    });
  }

  function pretty(name) {
    var n = String(name).replace(/_/g, " ");

    return n.charAt(0).toUpperCase() + n.slice(1);
  }

  // ---- popups --------------------------------------------------------------

  function kv(host, k, v) {
    if (v === null || v === undefined || v === "") return;

    var row = GuiUI.el("div", "kv");

    row.appendChild(GuiUI.el("span", "k", k));
    row.appendChild(GuiUI.el("span", null, String(v)));
    host.appendChild(row);
  }

  function popupFor(row) {
    var box = GuiUI.el("div", "gui-map-popup");

    box.appendChild(GuiUI.el("h4", null, GuiUI.dash(row.name)));

    if (row.class === "nest") {
      kv(box, "Species", row.species);
      kv(box, "Patch", row.patch && pretty(row.patch));
      kv(box, "Found", row.discovery_date);
      kv(box, "Substrates", row.substrates);
      kv(box, "Height (m)", row.height_m);
      kv(box, "Last check", row.last_check);

      if (row.last_eggs !== null && row.last_eggs !== undefined) {
        kv(box, "Last eggs / young",
          GuiUI.dash(row.last_eggs) + " / " + GuiUI.dash(row.last_young));
      }
      kv(box, "Location", row.location_description);

      if (Number(row.artificial_candidate) === 1) {
        kv(box, "Artificial", "candidate");
      }
      if (Number(row.is_current) === 0) kv(box, "Status", "concluded");
    } else {
      kv(box, "Class", pretty(row.class || "other"));
      kv(box, "Note", row.note);
    }
    return box;
  }

  // Popup photos, exactly as the app lazy-loads them: the marker list is
  // photo-free; the point's nav photo is fetched only when its popup opens.
  // /map_points carries the gps point id as `idx`.

  function lazyPopupPhoto(row, popup) {
    var pid = row.idx || row.point_id;

    if (!pid) return;

    if (row._photoSrc) {
      placePopupPhoto(popup, row._photoSrc);
      return;
    }
    if (row._photoTried) return;
    row._photoTried = true;

    GuiApi.get("/gps_points/" + encodeURIComponent(pid) + "/photo")
      .then(function (r) {
        var src = GuiUI.asDataUri(r && r.nav_photo);

        if (!src) return;

        row._photoSrc = src;
        placePopupPhoto(popup, src);
      })
      .catch(function () {});
  }

  function placePopupPhoto(popup, src) {
    var el = popup.getElement();
    var box = el && el.querySelector(".gui-map-popup");

    if (!box || box.querySelector(".gui-map-popup-photo")) return;

    var img = GuiUI.el("img", "gui-map-popup-photo");

    img.src = src;
    GuiUI.zoomable(img);
    img.addEventListener("load", function () { popup.update(); });
    box.appendChild(img);
  }

  // ---- the options popup (mirrors the app's Map-options screen) ------------

  function openOptions() {
    var m = GuiUI.modal("Map options");
    var box = GuiUI.el("div", "gui-map-toggles");

    toggle(box, "Subset to today's data", state.options.today,
      function (on) {
        state.options.today = on;
        redraw();
      });

    toggle(box, "Show weather",
      state.map.hasLayer(state.overlays.Precipitation),
      function (on) {
        setGroup("Precipitation", on);
        setGroup("NEXRAD", on);
      });

    toggle(box, "Include patch boundaries",
      state.map.hasLayer(state.overlays.Patches),
      function (on) { setGroup("Patches", on); });

    toggle(box, "Show paths",
      state.map.hasLayer(state.overlays.Paths),
      function (on) { setGroup("Paths", on); });

    toggle(box, "Show search tracks",
      state.map.hasLayer(state.overlays["Search tracks"]),
      function (on) { setGroup("Search tracks", on); });

    toggle(box, "Show sampling points",
      state.map.hasLayer(state.overlays.Coverboards),
      function (on) {
        setGroup("Coverboards", on);
        setGroup("Point Counts", on);
      });

    toggle(box, "Include OpenStreetMap",
      state.map.hasLayer(state.bases["Street Map"]),
      function (on) {
        if (on) {
          state.map.removeLayer(state.bases.Satellite);
          state.bases["Street Map"].addTo(state.map);
        } else {
          state.map.removeLayer(state.bases["Street Map"]);
          state.bases.Satellite.addTo(state.map);
        }
      });

    m.body.appendChild(box);

    var bar = GuiUI.el("div", "gui-actions");
    var refresh = GuiUI.el("button", "gui-btn", "Refresh data");

    refresh.addEventListener("click", function () {
      m.close();
      loadData();
    });
    bar.appendChild(refresh);
    m.body.appendChild(bar);
  }

  function setGroup(name, on) {
    var g = state.overlays[name];

    if (!g) return;
    if (on && !state.map.hasLayer(g)) g.addTo(state.map);
    if (!on && state.map.hasLayer(g)) state.map.removeLayer(g);
  }

  function toggle(host, label, checked, onChange) {
    var lab = GuiUI.el("label");
    var cb = GuiUI.el("input");

    cb.type = "checkbox";
    cb.checked = checked;
    cb.addEventListener("change", function () { onChange(cb.checked); });
    lab.appendChild(cb);
    lab.appendChild(GuiUI.el("span", null, label));
    host.appendChild(lab);
  }

  function zoomToSelection() {
    var name = state.options.patch;

    if (name === "__all__") {
      fitAllPatches();
      return;
    }

    var geom = (window.fieldPatches || {})[name];

    if (geom) {
      state.map.fitBounds(window.L.polygon(geom).getBounds().pad(0.15));
    }
  }

  function fitAllPatches() {
    var names = Object.keys(window.fieldPatches || {});

    if (!names.length) return;

    var bounds = null;

    names.forEach(function (n) {
      var b = window.L.polygon(window.fieldPatches[n]).getBounds();

      bounds = bounds ? bounds.extend(b) : b;
    });
    if (bounds) state.map.fitBounds(bounds.pad(0.1));
  }

  // ---- mount ---------------------------------------------------------------

  GuiPages.register({
    id: "map",
    label: "Map",
    mount: function (host) {
      if (!window.L) {
        host.appendChild(GuiUI.el("p", "gui-empty",
          "Leaflet failed to load — check vendor/leaflet/."));
        return;
      }

      // Top bar (above the map): the patch dropdown from the app's main
      // menu, plus the Map options button (replaces the in-map cog).

      var bar = GuiUI.el("div", "gui-card gui-map-bar");
      var sel = GuiUI.el("select", "gui-input");
      var all = GuiUI.el("option", null, "All patches");

      all.value = "__all__";
      sel.appendChild(all);
      Object.keys(window.fieldPatches || {}).sort().forEach(function (n) {
        var o = GuiUI.el("option", null, pretty(n));

        o.value = n;
        sel.appendChild(o);
      });
      sel.addEventListener("change", function () {
        state.options.patch = sel.value;
        redraw();
        zoomToSelection();
      });

      var optBtn = GuiUI.el("button", "gui-btn", "Map options");

      optBtn.addEventListener("click", openOptions);
      bar.appendChild(sel);
      bar.appendChild(optBtn);
      host.appendChild(bar);

      var shell = GuiUI.el("div", "gui-map-shell");
      var mapDiv = GuiUI.el("div", "gui-map");

      mapDiv.id = "guiMap";
      shell.appendChild(mapDiv);
      host.appendChild(shell);

      // attributionControl off, zoom on -- matching make_field_map.R.

      state.map = window.L.map(mapDiv, {
        zoomControl: true,
        attributionControl: false
      });

      // Base layers, exactly as the app defines them.

      state.bases.Satellite = window.L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/" +
          "World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 21, maxNativeZoom: 19 }
      );
      state.bases["Street Map"] = window.L.tileLayer(
        "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        { maxZoom: 19 }
      );
      state.bases.Satellite.addTo(state.map);

      // Weather overlays: the same two NOAA WMS layers.

      state.overlays.Precipitation = window.L.tileLayer.wms(
        "https://opengeo.ncep.noaa.gov/geoserver/conus/conus_cref_qcd/ows",
        {
          layers: "conus_cref_qcd",
          format: "image/png",
          transparent: true,
          opacity: 0.50,
          version: "1.3.0"
        }
      );
      state.overlays.NEXRAD = window.L.tileLayer.wms(
        "https://opengeo.ncep.noaa.gov/geoserver/klwx/ows",
        {
          layers: "klwx_sr_bref",
          format: "image/png",
          transparent: true,
          opacity: 0.65
        }
      );

      // Marker groups. Weather starts OFF, the rest ON (app defaults).

      GROUPS.forEach(function (name) {
        state.overlays[name] = window.L.layerGroup().addTo(state.map);
      });
      state.waypoints = window.L.layerGroup().addTo(state.map);

      // Paths start ON; search tracks start OFF -- both live in the
      // layers control so either can be flipped there.

      state.overlays.Paths = window.L.layerGroup().addTo(state.map);
      state.overlays["Search tracks"] = window.L.layerGroup();
      drawPaths();

      // The layers control, exactly as addLayersControl builds it.

      state.control = window.L.control.layers(
        state.bases,
        {
          Precipitation: state.overlays.Precipitation,
          NEXRAD: state.overlays.NEXRAD,
          Patches: state.overlays.Patches,
          Paths: state.overlays.Paths,
          "Search tracks": state.overlays["Search tracks"],
          Coverboards: state.overlays.Coverboards,
          "Trail Cameras": state.overlays["Trail Cameras"],
          "Point Counts": state.overlays["Point Counts"],
          Nests: state.overlays.Nests
        },
        { collapsed: true }
      ).addTo(state.map);

      // Metric scale bar, bottom-left (addScaleBar equivalent).

      window.L.control.scale({
        position: "bottomleft",
        maxWidth: 300,
        metric: true,
        imperial: false
      }).addTo(state.map);

      state.map.on("zoomend", onZoom);

      fitAllPatches();

      if (!Object.keys(window.fieldPatches || {}).length) {
        state.map.setView([38.89, -78.17], 14);
      }

      loadData();
      loadTracks();
      applyFocus();
    },

    onShow: function () {
      if (state.map) {
        setTimeout(function () {
          state.map.invalidateSize();
          applyFocus();
        }, 0);
      }
    }
  });

  // A nest-info mini map (nests.js) can request a jump here: it stashes
  // { lat, lng, zoom } on window.__guiMapFocus before switching tabs.

  function applyFocus() {
    var f = window.__guiMapFocus;

    if (!f || !state.map) return;
    window.__guiMapFocus = null;
    state.map.setView([f.lat, f.lng], f.zoom || 19);
  }
})();
