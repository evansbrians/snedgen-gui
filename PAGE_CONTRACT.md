# Data-entry GUI — page contract

Standalone webpage (no Shiny, no Quarto). Served by Caddy from the VM beside the
API, so every request is **same-origin**: fetch `"/nests"`, never an
absolute host. Tara opens it on a laptop.

Read this before writing a page. Every page follows it so the five pages stay one
app rather than five.

## The shell gives you

| Global | What it is |
|---|---|
| `GuiApi.get/post/patch/del(path, body)` | Promise-returning fetch. Adds auth, throws `ApiError` with `.status` on non-2xx. |
| `GuiApi.lookups()` | Cached `GET /lookups` — coded vocabularies (species, observers, patches). |
| `GuiPages.register(page)` | Registers a page with the shell. Call it at file scope. |
| `GuiUI.table(cols, rows, opts)` | Renders a data table. `opts.onEdit(row)`, `opts.onDelete(row)`. |
| `GuiUI.form(fields, values)` | Renders a form; returns `{ el, read() }`. |
| `GuiUI.status(msg, kind)` | One status line. `kind`: `"ok"` \| `"err"` \| `"busy"`. |
| `GuiUI.confirm(msg)` | Promise<boolean>. Use before any delete. |

## A page module

```js
GuiPages.register({
  id: "point_counts",         // URL hash + nav id
  label: "Point counts",      // nav button text
  mount: function (el) { }    // called once, when first shown; el is an empty div
});
```

`mount` owns everything inside `el`. It is called once. Re-render on your own
after a write; the shell does not re-mount you.

## Rules

1. **No page invents its own fetch.** Use `GuiApi`. Auth, errors and the base
   path live in one place.
2. **Surface errors.** Catch, then `GuiUI.status(msg, "err")`. Never swallow: a
   silent catch cost us a whole debugging session on the field app.
3. **Confirm every delete.** `GuiUI.confirm()` first.
4. **Coded vocabularies come from `GuiApi.lookups()`**, never hardcoded lists.
5. **Join on keys, never names.** A parent id is the only link to its children.
6. **Server assigns ids.** POST returns the created row; use what it gives you.
7. **Style: no inline CSS.** Use the classes in `src/css/gui.css`.

## Endpoints each page expects

The API does not have these yet — the GUI defines the surface, then plumber is
built to match. Parent/child families use nested routes.

| Page | Endpoints |
|---|---|
| Point counts | `GET/POST /point_counts`, `GET/PATCH/DELETE /point_counts/<id>`, `GET/POST /point_counts/<id>/intervals`, `PATCH/DELETE /count_intervals/<id>` |
| Cameras | `GET/POST /predator_cameras`, `PATCH/DELETE /predator_cameras/<id>`, `GET/POST /predator_cameras/<id>/maintenance`, `PATCH/DELETE /camera_maintenance/<id>` |
| Schedule | `GET/POST /schedule_days`, `PATCH/DELETE /schedule_days/<id>` |
| Nests | `GET /nests`, `POST /nests`, `PATCH /nests/<id>` (these already exist) |

List routes accept filters as query params (e.g. `?patch_id=coyote&from=2026-07-01`).

## Schema notes that bite

- Surrogate ids (`point_count_id`, …) are currently reassigned by
  `nightly_load.R` on every run. They only become stable once that table
  leaves the loader. Do not cache an id across a reload.
- `count_interval.interval` is CHECKed 1..3; `distance` and `detection` have
  CHECK constraints too — read them off `/lookups`, do not invent options.
- `count_interval` is `ON DELETE CASCADE` from `point_counts`. Deleting a
  count deletes its intervals.

## v2 conventions (July 2026 rework)

- **Live data.** Demo fixtures run ONLY with `?demo=1`; every normal load
  talks to the live API (same-origin on the VM, else
  `https://snednestudy.duckdns.org`; `localStorage.guiApiBase` overrides).
- **Clickable rows, no row buttons.** Clicking a table row opens a small
  popup (`GuiUI.rowMenu`) offering Modify / Delete / drill-down.
- **Edits happen in place.** Simple rows edit inline (`GuiUI.table`'s
  `inlineEdit`: cells become inputs where the row sits). Extensive records
  (nest discovery, schedule day) use a modal (`GuiUI.modal` /
  `GuiUI.formModal`). Nothing jumps to the top of the page.
- **Modals stack.** A confirm or row menu opened from inside a popup rides
  on top of it and returns to it on close.
- **Schedule is week-based.** Previous / next week navigation, day cards
  (not tables), a Field-day checkbox at the top of each day, Sunday hidden
  while Mon–Sat are all field days. Patch rows 3+ in Edit day write
  `search_patch_3` / `tns_patch_3` / `helper_patch_3` (and `_4`) — the
  schema + plumber must grow those columns before they persist.
- **Map is the last tab.** Native Leaflet (vendored in `vendor/leaflet/`),
  fed from `GET /gps_points`, `/nests`, `/predator_cameras`; patch
  boundaries from `src/data/field_patches.js` (copied from nest_app_api).
  Options live behind the cog and mirror the field app's Map options.
