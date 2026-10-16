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

  /** Remove a whole month table and all its rows. */
  return function deleteMonth(data, key) {
    if (!data.months[key])
      return { ok: false, error: "That month has no table yet." };
    var removed = data.months[key].rows.length;
    delete data.months[key];
    return { ok: true, removedRows: removed };
  };
});
