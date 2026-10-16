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

  /** Create an empty table for month `key` ("YYYY-MM"). */
  return function addMonth(data, key) {
    if (!L.isValidMonthKey(key)) return { ok: false, error: "Invalid month." };
    if (data.months[key])
      return { ok: false, error: "That month already exists." };
    data.months[key] = { opening: null, rows: [] };
    return { ok: true, month: data.months[key] };
  };
});
