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

  /** One row of a month, or null. */
  return function getRow(data, key, id) {
    var m = data.months[key];
    if (!m) return null;
    for (var i = 0; i < m.rows.length; i++)
      if (m.rows[i].id === id) return m.rows[i];
    return null;
  };
});
