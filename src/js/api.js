// api.js -- the ONE way this app talks to the REST API.
//
// The GUI reads and writes the LIVE database. When the page is served from
// the VM beside the API, requests are same-origin (relative paths). Opened
// from anywhere else (a workstation, file://), it falls back to the live
// host below; localStorage.guiApiBase overrides either.
"use strict";

(function () {
  var TOKEN_KEY = "guiApiToken";
  var BASE_KEY = "guiApiBase";
  var LIVE_HOST = "https://snednestudy.duckdns.org";

  function base() {
    var stored = localStorage.getItem(BASE_KEY);

    if (stored !== null && stored !== "") return stored.replace(/\/+$/, "");

    // Same-origin ONLY when the page is actually served beside the API (the
    // VM's own host). Anywhere else -- GitHub Pages, a laptop dev server,
    // file:// -- talks to the live host. The ⚙ API popup can override.

    if (/(^|\.)snednestudy\.duckdns\.org$/i.test(location.hostname)) {
      return "";
    }
    return LIVE_HOST;
  }

  function token() {
    return (localStorage.getItem(TOKEN_KEY) || "").trim();
  }

  function setToken(t) {
    localStorage.setItem(TOKEN_KEY, String(t || "").trim());
  }

  function hasToken() {
    return !!token();
  }

  // An HTTP failure that reached the server carries .status; a network
  // failure does not. Callers use that to tell "rejected" from "unreachable".

  function ApiError(message, status, body) {
    this.name = "ApiError";
    this.message = message;
    this.status = status;
    this.body = body;
  }
  ApiError.prototype = Object.create(Error.prototype);

  function request(method, path, body) {
    var opts = {
      method: method,
      headers: { Authorization: "Bearer " + token() }
    };

    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }

    return fetch(base() + path, opts).then(function (resp) {
      return resp.text().then(function (text) {
        var parsed = null;

        try {
          parsed = text ? JSON.parse(text) : null;
        } catch (e) {
          parsed = text;
        }

        if (!resp.ok) {
          throw new ApiError(
            method + " " + path + " failed [" + resp.status + "]: " +
              String(text).slice(0, 200),
            resp.status,
            parsed
          );
        }
        return parsed;
      });
    });
  }

  // GET /lookups is the source for every coded vocabulary. Cached: it does
  // not change within a session, and every page needs it.

  var lookupsCache = null;

  function lookups() {
    if (lookupsCache) return Promise.resolve(lookupsCache);

    return request("GET", "/lookups").then(function (l) {
      lookupsCache = l || {};
      return lookupsCache;
    });
  }

  // A disk photo (/photos/<id>) is raw bytes behind the bearer token, so an
  // <img src> cannot load it directly. Fetch with auth -> blob object URL.

  function photoBlobUrl(photoId) {
    return fetch(base() + "/photos/" + encodeURIComponent(photoId), {
      headers: { Authorization: "Bearer " + token() }
    }).then(function (resp) {
      if (!resp.ok) {
        throw new ApiError("photo fetch failed [" + resp.status + "]",
          resp.status, null);
      }
      return resp.blob();
    }).then(function (blob) {
      return URL.createObjectURL(blob);
    });
  }

  function setBase(u) {
    u = String(u || "").trim().replace(/\/+$/, "");

    if (u) localStorage.setItem(BASE_KEY, u);
    else localStorage.removeItem(BASE_KEY);
  }

  window.GuiApi = {
    get: function (path) { return request("GET", path); },
    post: function (path, body) { return request("POST", path, body); },
    patch: function (path, body) { return request("PATCH", path, body); },
    del: function (path) { return request("DELETE", path); },
    lookups: lookups,
    photoBlobUrl: photoBlobUrl,
    base: base,
    setBase: setBase,
    token: token,
    setToken: setToken,
    hasToken: hasToken,
    ApiError: ApiError
  };
})();
