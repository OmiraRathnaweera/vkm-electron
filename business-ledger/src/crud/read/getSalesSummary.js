/* Works in the app (window.Crud.<name>) and in Node tests (require). */
(function (root, factory) {
    var isNode = typeof module === "object" && module.exports;
    var fn = factory(isNode ? require("../../logic.js") : root.Logic);
    if (isNode) module.exports = fn;
    else { root.Crud = root.Crud || {}; root.Crud[fn.name] = fn; }
})(typeof self !== "undefined" ? self : this, function (L) {
    "use strict";

    /**
     * Calculated figures for a month of sales: cubes and sales per stone, daily totals,
     * total cubes and overall total sales. Returns null if the month has no table.
     */
    return function getSalesSummary(data, key) {
        var m = data.sales[key];
        return m ? L.computeSalesMonth(m) : null;
    };
});