// species_info.js -- the field app's Species info reference, LAST tab.
//
// Content: window.speciesInfo (src/data/species_info.js), extracted from
// nest_app_api's baked fieldSpeciesHTML -- the same panels the app shows,
// but behind a DROPDOWN instead of an accordion. First entry (American
// Goldfinch) shows by default.
"use strict";

(function () {
  GuiPages.register({
    id: "species_info",
    label: "Species info",
    mount: function (host) {
      var head = GuiUI.el("div", "gui-page-head");

      head.appendChild(GuiUI.el("h2", null, "Species info"));
      host.appendChild(head);

      var list = window.speciesInfo || [];

      if (!list.length) {
        host.appendChild(GuiUI.el("p", "gui-empty",
          "Species information is currently unavailable."));
        return;
      }

      var filters = GuiUI.el("div", "gui-card");
      var bar = GuiUI.el("div", "gui-form");
      var row = GuiUI.el("div", "gui-field");
      var lab = GuiUI.el("label", "gui-label", "Species");
      var sel = GuiUI.el("select", "gui-input");

      lab.setAttribute("for", "speciesInfoSelect");
      sel.id = "speciesInfoSelect";

      list.forEach(function (sp, i) {
        var o = GuiUI.el("option", null, sp.name);

        o.value = String(i);
        sel.appendChild(o);
      });

      row.appendChild(lab);
      row.appendChild(sel);
      bar.appendChild(row);
      filters.appendChild(bar);
      host.appendChild(filters);

      var card = GuiUI.el("div", "gui-card gui-species-panel");

      host.appendChild(card);

      function show(i) {
        var sp = list[i];

        card.innerHTML = "";
        card.appendChild(GuiUI.el("h3", null, sp.name));

        var body = GuiUI.el("div");

        // Trusted static content extracted from the app's own build.

        body.innerHTML = sp.html;
        card.appendChild(body);
      }

      sel.addEventListener("change", function () {
        show(Number(sel.value));
      });
      show(0);
    }
  });
})();
