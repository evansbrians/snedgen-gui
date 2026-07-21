// mock.js -- DEMO MODE. In-memory fixtures so the GUI is fully clickable
// with no API, no token and no network.
//
// Active ONLY with ?demo=1 in the URL. Every normal load talks to the live
// API (see api.js). Purpose: review the interface without touching real
// data; a reload resets everything.
"use strict";

(function () {
  function enabled() {
    return location.search.indexOf("demo=1") > -1;
  }

  if (!enabled()) return;

  // ---- fixtures ------------------------------------------------------------

  var PATCHES = ["coyote", "forest_geo", "leech", "witch_hazel"];

  var db = {
    lookups: {
      patches: PATCHES.map(function (p) {
        return { patch_id: p, label: p.replace(/_/g, " ") };
      }),
      observers: [
        { observer_id: "TNS" }, { observer_id: "BSE" }, { observer_id: "JMR" }
      ],
      species: [
        { species_code: "INBU", common_name: "Indigo Bunting" },
        { species_code: "NOCA", common_name: "Northern Cardinal" },
        { species_code: "ARNE", common_name: "Artificial nest" }
      ],
      species_engine: [
        { species_code: "INBU", species_name: "Indigo Bunting" },
        { species_code: "NOCA", species_name: "Northern Cardinal" },
        { species_code: "AMRO", species_name: "American Robin" },
        { species_code: "CACH", species_name: "Carolina Chickadee" }
      ],
      coverboard_species: [
        { species: "DEFU", label: "Northern Dusky Salamander" },
        { species: "PLCI", label: "Slimy Salamander" },
        { species: "THSI", label: "Common Gartersnake" }
      ],
      count_distances: ["< 25 m", "25-50 m", "50-75 m", "75-100 m", "> 100 m"],
      count_detections: ["A", "V", "B"],
      substrates: [
        { substrate_id: 1, label: "Box elder" },
        { substrate_id: 2, label: "Multiflora rose" },
        { substrate_id: 3, label: "Spicebush" }
      ],
      nest_fate_codes: [
        { code: "FLED", label: "Fledged" },
        { code: "PRED", label: "Depredated" }
      ],
      nest_status_codes: [{ code: "A", label: "Active" }],
      young_status_codes: [{ code: "N", label: "Nestlings" }],
      adult_present_codes: [{ code: "F", label: "Female" }],
      adult_activity_codes: [{ code: "INC", label: "Incubating" }],
      discovery_stage_codes: [{ code: "BLDG", label: "Building" }],
      point_classes: ["Nest", "Landmark", "point_count", "coverboard"]
    },

    coverboard_checks: [
      {
        coverboard_check_id: 1, patch_id: "coyote", board_num: 3,
        check_date: "2026-07-14", check_time: "09:15", observer_id: "TNS",
        notes: "Damp under board."
      },
      {
        coverboard_check_id: 2, patch_id: "leech", board_num: 1,
        check_date: "2026-07-14", check_time: "10:40", observer_id: "BSE",
        notes: null
      }
    ],
    coverboard_obs: [
      { obs_id: 1, coverboard_check_id: 1, species: "DEFU", count: 2,
        photo_id: null, notes: null },
      { obs_id: 2, coverboard_check_id: 1, species: "THSI", count: 1,
        photo_id: null, notes: "Juvenile." }
    ],

    point_counts: [
      {
        point_count_id: 1, observer_id: "TNS", patch_id: "forest_geo",
        count_date: "2026-07-14", weather: "Clear, calm", start_time: "06:05"
      }
    ],
    count_intervals: [
      { count_interval_id: 1, point_count_id: 1, interval: 1,
        species: "INBU", distance: "25-50 m", detection: "A", count: 2 },
      { count_interval_id: 2, point_count_id: 1, interval: 2,
        species: "NOCA", distance: "< 25 m", detection: "B", count: 1 }
    ],

    visits: buildVisits(),

    predator_cameras: [
      { camera_id: "coyote_trailcam_1", patch_id: "coyote",
        gps_point_id: "pt-cam-1",
        last_maintenance: "2026-07-10", install: 0, replace_sd: 1,
        replace_batteries: 1, notes: "SD nearly full." }
    ],
    camera_maintenance: [
      { maintenance_id: 1, camera_id: "coyote_trailcam_1",
        event_date: "2026-07-10", install: 0, replace_sd: 1,
        replace_batteries: 1, notes: "SD nearly full." }
    ],

    nests: [
      {
        nest_id: "N060", patch_id: "leech", species_code: "INBU",
        species_common: "Indigo Bunting",
        discovery_date: "2026-06-28", discovery_stage: "BLDG",
        height_m: 1.2, camera_or_control: "Camera",
        location_description: "Rose thicket by trail",
        last_check: "2026-07-14",
        nest_fate: null, selfie_stick: 0, artificial_candidate: 1,
        substrates: "Multiflora rose",
        gps_point_id: "pt-n060"
      },
      {
        nest_id: "NQ060", patch_id: "leech", species_code: "ARNE",
        species_common: "Artificial nest",
        discovery_date: "2026-07-11", discovery_stage: null,
        height_m: 1.5, camera_or_control: "Control",
        location_description: "Paired with N060",
        last_check: "2026-07-14",
        nest_fate: "FLED", selfie_stick: 0, artificial_candidate: 0,
        substrates: "Multiflora rose",
        gps_point_id: "pt-n060"
      },
      {
        nest_id: "N061", patch_id: "coyote", species_code: "NOCA",
        species_common: "Northern Cardinal",
        discovery_date: "2026-07-05", discovery_stage: "BLDG",
        height_m: 2.0, camera_or_control: "Control",
        location_description: "Spicebush at creek bend",
        last_check: "2026-07-15",
        nest_fate: null, selfie_stick: 1, artificial_candidate: 0,
        substrates: "Spicebush",
        gps_point_id: "pt-n061"
      }
    ],
    intervals: [
      { check_id: 1, nest_id: "N060", check_date: "2026-07-14",
        check_time: "08:43", current_state: "Active", observer_id: "TNS",
        host_eggs: 3, host_young: 0, bhco_eggs: 0, bhco_young: 0,
        nest_status: "A", notes: null },
      { check_id: 2, nest_id: "N060", check_date: "2026-07-17",
        check_time: "09:02", current_state: "Active", observer_id: "BSE",
        host_eggs: 3, host_young: 0, bhco_eggs: 1, bhco_young: 0,
        nest_status: "A", notes: "BHCO egg appeared." }
    ],

    gps_points: {
      type: "FeatureCollection",
      features: [
        // Coordinates sit INSIDE real patch polygons so the GUI's derived
        // patch column has something to find in demo mode.

        feature("pt-n060", "N060", "Nest", -78.149912, 38.896706),
        feature("pt-n061", "N061", "Nest", -78.171533, 38.892349),
        feature("pt-cam-1", "coyote_trailcam_1", "Landmark",
          -78.171533, 38.892349),
        feature("pt-lm-1", "Big oak", "Landmark", -78.1672, 38.8917),
        feature("pt-pc-1", "PC coyote", "point_count",
          -78.156907, 38.892612),
        feature("pt-cb-1", "Board 3", "coverboard", -78.171533, 38.892349)
      ]
    },

    schedule_days: buildSchedule()
  };

  // Visits land in the current week so the week view has rows to show.

  function buildVisits() {
    var today = new Date();
    var yest = new Date(
      today.getFullYear(), today.getMonth(), today.getDate() - 1
    );

    return [
      { visit_id: 1, visit_date: isoOf(today), patch_id: "coyote",
        helper: "JMR", activity: "Nest search", status: "Complete",
        notes: null },
      { visit_id: 2, visit_date: isoOf(yest), patch_id: "witch_hazel",
        helper: "-", activity: "Coverboard check", status: "Partial",
        notes: "Rain stopped us at board 4." }
    ];
  }

  // /map_points rows, mirroring v_map_point's shape (icon / fades / size).

  function buildMapPoints() {
    return [
      { idx: "pt-n060", name: "N060", class: "nest", lat: 38.8905, lng: -78.1655,
        icon: "nest_active_eggs", is_current: 1, scheduled_today: 1,
        size: 1.15, patch: "leech", species: "Indigo Bunting",
        substrates: "Multiflora rose", height_m: 1.2,
        discovery_date: "2026-06-28", last_check: "2026-07-17",
        last_eggs: 3, last_young: 0, artificial_candidate: 1 },
      { idx: "pt-n060", name: "NQ060", class: "nest", lat: 38.8907, lng: -78.1657,
        icon: "nest_artificial", is_current: 1, scheduled_today: 1,
        size: 1.15, patch: "leech", species: "Artificial nest",
        discovery_date: "2026-07-11", last_check: "2026-07-17",
        artificial_candidate: 0 },
      { idx: "pt-n061", name: "N061", class: "nest", lat: 38.8930, lng: -78.1710,
        icon: "nest_inactive", is_current: 0, scheduled_today: 0,
        size: 1, patch: "coyote", species: "Northern Cardinal",
        discovery_date: "2026-07-05", last_check: "2026-07-15",
        artificial_candidate: 0 },
      { idx: "pt-cb-1", name: "coyote_cb_3", class: "coverboard", lat: 38.8918,
        lng: -78.1690, icon: "cb_3", is_current: 1, scheduled_today: 1,
        size: 1 },
      { idx: "pt-cam-1", name: "coyote_trailcam_1", class: "trailcam", lat: 38.8922,
        lng: -78.1698, icon: "cam_1", is_current: 1, scheduled_today: 0,
        size: 1 },
      { idx: "pt-pc-1", name: "PC coyote", class: "point_count", lat: 38.8926,
        lng: -78.1701, icon: "pc", is_current: 1, scheduled_today: 1,
        size: 1 },
      { idx: "pt-lm-1", name: "Big oak", class: "landmark", lat: 38.8917, lng: -78.1672,
        icon: "marker", is_current: 1, scheduled_today: 1, size: 1,
        note: "Shortcut to the creek crossing" }
    ];
  }

  // A small baked JPEG so the nest-info photo slot has something to show.

  var DEMO_PHOTO = "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";

  function feature(id, name, cls, lng, lat) {
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng, lat] },
      properties: { point_id: id, name: name, class: cls }
    };
  }

  // This week, Monday through Saturday, three patch orders per day; Thursday
  // is a weather day so the Sunday card has a reason to appear.

  function buildSchedule() {
    var out = [];
    var id = 1;
    var now = new Date();
    var monday = new Date(
      now.getFullYear(), now.getMonth(),
      now.getDate() - ((now.getDay() + 6) % 7)
    );
    var names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    names.forEach(function (nm, di) {
      var d = new Date(
        monday.getFullYear(), monday.getMonth(), monday.getDate() + di
      );
      var dateStr = isoOf(d);

      for (var order = 1; order <= 3; order++) {
        out.push({
          schedule_day_id: id++,
          week: 30,
          date: dateStr,
          day: nm,
          helper: di % 2 ? "JMR" : "-",
          arrive: "05:20",
          sunrise: "05:58",
          patch_order: order,
          patch_count: PATCHES[(di + order) % PATCHES.length],
          boards: order === 1 ? "1,2,3" : "-",
          search_patch_1: "coyote",
          search_patch_2: order === 1 ? "leech" : "-",
          field: nm === "Thu" ? "FALSE" : "TRUE",
          notes: di === 0 ? "Bring the tall ladder." : null,
          helper_patch_1: "Nest search",
          tns_patch_1: "Nest search",
          helper_patch_2: "-",
          tns_patch_2: "-",
          check_nests: order === 1 ? "N060,NQ060" : "-",
          predator_cameras: order === 2 ? "coyote_trailcam_1" : "-",
          departure_time: "04:35",
          scbi_departure_time: "14:20",
          point_count_time: "06:05",
          weather: JSON.stringify({
            detailed: "Mostly clear, with a low around 61. Light and " +
              "variable wind.",
            summary: "High 84°F · Chance of rain 5%",
            hourly: [
              { time: "06:00", forecast: "Clear", temp: 63, rain: 0 },
              { time: "07:00", forecast: "Clear", temp: 68, rain: 0 },
              { time: "08:00", forecast: "Sunny", temp: 74, rain: 5 }
            ]
          })
        });
      }
    });
    return out;
  }

  function isoOf(d) {
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());

    if (m.length < 2) m = "0" + m;
    if (day.length < 2) day = "0" + day;
    return d.getFullYear() + "-" + m + "-" + day;
  }

  // ---- tiny router ---------------------------------------------------------

  var nextId = 1000;

  function parse(path) {
    var q = path.indexOf("?");
    var query = {};

    if (q > -1) {
      path.slice(q + 1).split("&").forEach(function (kv) {
        var p = kv.split("=");
        if (p[0]) query[p[0]] = decodeURIComponent(p[1] || "");
      });
      path = path.slice(0, q);
    }
    return { parts: path.split("/").filter(Boolean), query: query };
  }

  function byId(list, key, id) {
    return list.filter(function (r) {
      return String(r[key]) === String(id);
    })[0];
  }

  function removeFrom(name, key, id) {
    db[name] = db[name].filter(function (r) {
      return String(r[key]) !== String(id);
    });
  }

  function dateFilter(rows, dateKey, q) {
    return rows.filter(function (r) {
      if (q.from && r[dateKey] < q.from) return false;
      if (q.to && r[dateKey] > q.to) return false;
      if (q.patch_id && r.patch_id !== q.patch_id) return false;
      if (q.patch && r.patch_id !== q.patch) return false;
      if (q.week && String(r.week) !== String(q.week)) return false;
      return true;
    });
  }

  // Handlers keyed by "<METHOD> <collection>[/<depth>]". Kept deliberately
  // dumb: this exists to exercise the UI, not to model the schema.

  function route(method, path, body) {
    var p = parse(path);
    var head = p.parts[0];
    var id = p.parts[1];
    var sub = p.parts[2];

    if (head === "lookups") return db.lookups;

    if (head === "gps_points") {
      if (!id) return db.gps_points;

      if (sub === "photo") {
        return { point_id: id, nav_photo: DEMO_PHOTO, nav_photo_name: "demo.jpg" };
      }

      var feats = db.gps_points.features;
      var fi = -1;

      feats.forEach(function (f, i) {
        if (f.properties.point_id === id) fi = i;
      });
      if (fi === -1) throw new GuiApi.ApiError("point not found", 404, null);

      if (method === "PATCH") {
        merge(feats[fi].properties, body);
        return { point_id: id };
      }
      if (method === "DELETE") {
        feats.splice(fi, 1);
        return { deleted: true, point_id: id };
      }
      return feats[fi];
    }

    if (head === "map_points") return buildMapPoints();

    if (head === "tracks") {
      return [
        {
          track_id: "demo-track-1", name: "Coyote sweep",
          activity: "Nest search", patch_id: "coyote", length_m: 240,
          created_at: "2026-07-18T09:12:00",
          points: [
            { lat: 38.8920, lng: -78.1712 }, { lat: 38.8923, lng: -78.1706 },
            { lat: 38.8926, lng: -78.1699 }, { lat: 38.8922, lng: -78.1692 }
          ]
        },
        {
          track_id: "demo-track-2", name: "Leech edge walk",
          activity: "Nest search", patch_id: "leech", length_m: 180,
          created_at: "2026-07-19T07:40:00",
          points: [
            { lat: 38.8903, lng: -78.1660 }, { lat: 38.8906, lng: -78.1655 },
            { lat: 38.8909, lng: -78.1651 }
          ]
        }
      ];
    }

    if (head === "coverboard_checks") {
      if (sub === "obs") {
        if (method === "GET") {
          return db.coverboard_obs.filter(function (o) {
            return String(o.coverboard_check_id) === String(id);
          });
        }
        if (method === "POST") {
          var o = merge(
            { obs_id: nextId++, coverboard_check_id: Number(id) }, body
          );

          db.coverboard_obs.push(o);
          return o;
        }
      }
      return collection("coverboard_checks", "coverboard_check_id", method,
        id, body, p, function () {
          removeFrom("coverboard_obs", "coverboard_check_id", id);
        });
    }

    if (head === "coverboard_obs") {
      return collection("coverboard_obs", "obs_id", method, id, body, p);
    }

    if (head === "point_counts") {
      if (sub === "intervals") {
        if (method === "GET") {
          return db.count_intervals.filter(function (r) {
            return String(r.point_count_id) === String(id);
          });
        }
        if (method === "POST") {
          db.count_intervals = db.count_intervals.filter(function (r) {
            return String(r.point_count_id) !== String(id);
          });
          (body && body.rows || []).forEach(function (r) {
            db.count_intervals.push(
              merge({ count_interval_id: nextId++ }, r)
            );
          });
          return { saved: true };
        }
      }
      return collection("point_counts", "point_count_id", method, id, body,
        p, function () {
          removeFrom("count_intervals", "point_count_id", id);
        });
    }

    if (head === "count_intervals") {
      return collection("count_intervals", "count_interval_id", method, id,
        body, p);
    }

    if (head === "visits") {
      return collection("visits", "visit_id", method, id, body, p);
    }

    if (head === "predator_cameras") {
      if (sub === "maintenance") {
        if (method === "GET") {
          return db.camera_maintenance.filter(function (m) {
            return m.camera_id === id;
          });
        }
        if (method === "POST") {
          var m = merge({ maintenance_id: nextId++, camera_id: id }, body);

          db.camera_maintenance.push(m);
          return m;
        }
      }
      if (method === "POST" &&
          byId(db.predator_cameras, "camera_id", body && body.camera_id)) {
        throw new GuiApi.ApiError("camera_id already exists", 409, null);
      }
      return collection("predator_cameras", "camera_id", method, id, body,
        p, function () {
          removeFrom("camera_maintenance", "camera_id", id);
        });
    }

    if (head === "camera_maintenance") {
      return collection("camera_maintenance", "maintenance_id", method, id,
        body, p);
    }

    if (head === "nests") {
      if (sub === "intervals") {
        if (method === "POST") {
          var iv = merge({ check_id: nextId++, nest_id: id }, body);

          db.intervals.push(iv);
          return iv;
        }
        return db.intervals.filter(function (r) { return r.nest_id === id; });
      }

      // GET /nests/<id> serves the DETAIL shape the real API returns:
      // { nest, substrates, intervals, gps_point, photos }.

      if (method === "GET" && id) {
        var nest = byId(db.nests, "nest_id", id);

        if (!nest) throw new GuiApi.ApiError("nest not found", 404, null);

        var gp = null;

        db.gps_points.features.forEach(function (f) {
          if (f.properties.point_id === nest.gps_point_id) {
            gp = {
              point_id: f.properties.point_id,
              point_name: f.properties.name,
              point_class: f.properties.class,
              latitude: f.geometry.coordinates[1],
              longitude: f.geometry.coordinates[0],
              nav_photo: f.properties.nav_photo || DEMO_PHOTO,
              nav_photo_name: f.properties.nav_photo_name || "demo.png"
            };
          }
        });

        return {
          nest: nest,
          substrates: [],
          intervals: db.intervals.filter(function (r) {
            return r.nest_id === id;
          }),
          gps_point: gp,
          photos: []
        };
      }
      return collection("nests", "nest_id", method, id, body, p);
    }

    if (head === "intervals") {
      return collection("intervals", "check_id", method, id, body, p);
    }

    if (head === "schedule_days") {
      return collection("schedule_days", "schedule_day_id", method, id,
        body, p);
    }

    throw new GuiApi.ApiError(
      "No mock route for " + method + " " + path, 404, null
    );
  }

  function collection(name, key, method, id, body, p, onDelete) {
    if (method === "GET" && !id) {
      var rows = db[name].slice();
      var dateKey = name === "schedule_days" ? "date"
        : name === "visits" ? "visit_date" : null;

      return (dateKey || p.query.patch || p.query.patch_id || p.query.week)
        ? dateFilter(rows, dateKey || "___", p.query)
        : rows;
    }

    if (method === "GET") return byId(db[name], key, id);

    if (method === "POST") {
      var created = merge({}, body);

      if (created[key] === undefined || created[key] === null) {
        created[key] = nextId++;
      }
      db[name].push(created);
      return created;
    }

    if (method === "PATCH") {
      var row = byId(db[name], key, id);

      if (!row) throw new GuiApi.ApiError("Not found", 404, null);
      merge(row, body);
      return row;
    }

    if (method === "DELETE") {
      removeFrom(name, key, id);
      if (onDelete) onDelete();
      return { deleted: true };
    }
    throw new GuiApi.ApiError("Unsupported " + method, 405, null);
  }

  function merge(target, src) {
    Object.keys(src || {}).forEach(function (k) { target[k] = src[k]; });
    return target;
  }

  // ---- swap GuiApi ---------------------------------------------------------

  // Latency so Tara sees the real "Saving…" / "Loading…" states rather than
  // instant magic that would hide them in review.

  function respond(method, path, body) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try {
          resolve(JSON.parse(JSON.stringify(route(method, path, body))));
        } catch (e) {
          reject(e);
        }
      }, 140);
    });
  }

  var lookupsCache = null;

  GuiApi.get = function (p) { return respond("GET", p); };
  GuiApi.post = function (p, b) { return respond("POST", p, b); };
  GuiApi.patch = function (p, b) { return respond("PATCH", p, b); };
  GuiApi.del = function (p) { return respond("DELETE", p); };

  GuiApi.lookups = function () {
    if (lookupsCache) return Promise.resolve(lookupsCache);
    return respond("GET", "/lookups").then(function (l) {
      lookupsCache = l;
      return l;
    });
  };

  // A stored token skips the shell's gate; demo mode has nothing to
  // authorise.

  GuiApi.hasToken = function () { return true; };

  document.addEventListener("DOMContentLoaded", function () {
    var b = document.getElementById("guiDemoBanner");
    if (b) b.style.display = "";
  });

  if (window.console) {
    console.info(
      "GUI demo mode: in-memory fixtures, no API. Changes reset on reload."
    );
  }
})();
