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

  /** Sort a month's rows by date (stable: same-day rows keep their order). */
  return function sortRows(data, key) {
    var m = data.months[key];
    if (!m) return { ok: false, error: "That month has no table yet." };
    m.rows.sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
    return { ok: true };
  };
});
