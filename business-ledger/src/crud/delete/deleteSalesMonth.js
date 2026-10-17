/* Works in the app (window.Crud.<name>) and in Node tests (require). */
(function (root, factory) {
    var isNode = typeof module === "object" && module.exports;
    var fn = factory(isNode ? require("../../logic.js") : root.Logic);
    if (isNode) module.exports = fn;
    else { root.Crud = root.Crud || {}; root.Crud[fn.name] = fn; }
})(typeof self !== "undefined" ? self : this, function (L) {
    "use strict";

    /** Remove a whole month of sales. */
    return function deleteSalesMonth(data, key) {
        if (!data.sales[key]) return { ok: false, error: "That month has no sales table yet." };
        var removed = data.sales[key].rows.length;
        delete data.sales[key];
        return { ok: true, removedRows: removed };
    };
});