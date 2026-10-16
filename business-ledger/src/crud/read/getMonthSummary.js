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

  /**
   * Calculated figures for a month: opening, per-row balances, totals, closing.
   * Pass `computed` (from L.computeAll) to avoid recalculating.
   */
  return function getMonthSummary(data, key, computed) {
    var all = computed || L.computeAll(data);
    return all[key] || null;
  };
});
