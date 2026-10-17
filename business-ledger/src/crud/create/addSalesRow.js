/* Works in the app (window.Crud.<name>) and in Node tests (require). */
(function (root, factory) {
    var isNode = typeof module === "object" && module.exports;
    var fn = factory(isNode ? require("../../logic.js") : root.Logic);
    if (isNode) module.exports = fn;
    else { root.Crud = root.Crud || {}; root.Crud[fn.name] = fn; }
})(typeof self !== "undefined" ? self : this, function (L) {
    "use strict";

    /**
     * Add a day to a month's sales table with every stone at 0 cubes / 0 price.
     * Date: `input.date` if valid, else the day after the last row, else today (if inside the
     * month), else the 1st.
     */
    return function addSalesRow(data, key, input) {
        var m = data.sales[key];
        if (!m) return { ok: false, error: "That month has no sales table yet." };
        input = input || {};

        var date = input.date;
        if (!(L.isValidISO(date) && L.monthKeyOf(date) === key)) {
            var last = m.rows[m.rows.length - 1];
            var today = L.todayISO();
            var next = last && L.isValidISO(last.date) ? L.addDays(last.date, 1) : null;
            if (next && L.monthKeyOf(next) === key) date = next;
            else if (last && L.isValidISO(last.date) && L.monthKeyOf(last.date) === key) date = last.date;
            else if (L.monthKeyOf(today) === key) date = today;
            else date = key + "-01";
        }
        var row = { id: L.uid(), date: date, items: L.emptySalesItems() };
        m.rows.push(row);
        return { ok: true, row: row };
    };
});