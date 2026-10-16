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

  var FIELDS = { date: 1, desc: 1, category: 1, receipt: 1, payment: 1 };

  /**
   * Change one field of a row. `value` is what the user typed (string).
   * On success returns { ok:true, row, value } where `value` is the cleaned value
   * (money in cents) to show back in the cell. On failure the row is untouched.
   */
  return function updateRow(data, key, id, field, value) {
    var m = data.months[key];
    if (!m) return { ok: false, error: "That month has no table yet." };
    if (!FIELDS[field]) return { ok: false, error: "Unknown field." };
    var row = null;
    for (var i = 0; i < m.rows.length; i++)
      if (m.rows[i].id === id) row = m.rows[i];
    if (!row) return { ok: false, error: "Row not found." };

    if (field === "date") {
      if (!L.isValidISO(value) || L.monthKeyOf(value) !== key) {
        return {
          ok: false,
          error: "Please choose a date within " + L.monthLabel(key) + ".",
        };
      }
      row.date = value;
    } else if (field === "desc") {
      row.desc = String(value).trim().slice(0, 300);
    } else if (field === "category") {
      if (!L.isValidCategory(value))
        return { ok: false, error: "Please choose a category from the list." };
      row.category = value;
    } else {
      var cents = L.parseMoney(value);
      if (cents === null) {
        return {
          ok: false,
          error:
            "Enter a valid amount, e.g. 1500 or 1,500.50 (no negatives, max 2 decimals).",
        };
      }
      row[field] = cents;
    }
    return { ok: true, row: row, value: row[field] };
  };
});
