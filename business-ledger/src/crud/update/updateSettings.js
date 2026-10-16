/* Works in the app (window.Crud.<name>) and in Node tests (require). */
(function (root, factory) {
  var isNode = typeof module === "object" && module.exports;
  var fn = factory(isNode ? require("../../logic.js") : root.Logic);
  if (isNode) module.exports = fn;
  else {
    root.Crud = root.Crud || {};
    root.Crud[fn.name] = fn;
  }
})(typeof self !== "undefined" ? self : this, function (L) {
  "use strict";

  /** Change business name / currency label. */
  return function updateSettings(data, changes) {
    changes = changes || {};
    var s = data.settings;
    if (changes.businessName !== undefined) {
      s.businessName =
        String(changes.businessName).trim().slice(0, 80) || "My Business";
    }
    if (changes.currency !== undefined) {
      s.currency = String(changes.currency).trim().slice(0, 8);
    }
    return { ok: true, settings: s };
  };
});
