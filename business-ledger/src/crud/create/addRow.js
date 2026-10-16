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
   * Add a blank row (or one pre-filled from `input`) to month `key`.
   * The date defaults to the previous row's date, else today (if inside the month), else the 1st.
   */
  return function addRow(data, key, input) {
    var m = data.months[key];
    if (!m) return { ok: false, error: "That month has no table yet." };
    input = input || {};

    var date = input.date;
    if (!(L.isValidISO(date) && L.monthKeyOf(date) === key)) {
      var last = m.rows[m.rows.length - 1];
      var today = L.todayISO();
      if (last && L.isValidISO(last.date) && L.monthKeyOf(last.date) === key)
        date = last.date;
      else if (L.monthKeyOf(today) === key) date = today;
      else date = key + "-01";
    }

    var receipt = input.receipt === undefined ? 0 : L.parseMoney(input.receipt);
    var payment = input.payment === undefined ? 0 : L.parseMoney(input.payment);
    if (receipt === null || payment === null)
      return { ok: false, error: "Invalid amount." };

    var category =
      input.category === undefined ? L.DEFAULT_CATEGORY : input.category;
    if (!L.isValidCategory(category))
      return { ok: false, error: "Invalid category." };

    var row = {
      id: L.uid(),
      date: date,
      desc: String(input.desc || "")
        .trim()
        .slice(0, 300),
      category: category,
      receipt: receipt,
      payment: payment,
    };
    m.rows.push(row);
    return { ok: true, row: row };
  };
});
