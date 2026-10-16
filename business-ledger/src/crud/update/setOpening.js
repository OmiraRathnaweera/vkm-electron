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
   * Set a month's opening balance from typed text, or pass null to go back to
   * "carried forward from the previous month".
   */
  return function setOpening(data, key, text) {
    var m = data.months[key];
    if (!m) return { ok: false, error: "That month has no table yet." };
    if (text === null) {
      m.opening = null;
      return { ok: true, opening: null };
    }
    var cents = L.parseMoney(text);
    if (cents === null)
      return {
        ok: false,
        error: "Enter a valid amount, e.g. 25000 or 25,000.50",
      };
    m.opening = cents;
    return { ok: true, opening: cents };
  };
});
