/* Works in the app (window.Crud.<name>) and in Node tests (require). */
(function (root, factory) {
    var isNode = typeof module === "object" && module.exports;
    var fn = factory(isNode ? require("../../logic.js") : root.Logic);
    if (isNode) module.exports = fn;
    else { root.Crud = root.Crud || {}; root.Crud[fn.name] = fn; }
})(typeof self !== "undefined" ? self : this, function (L) {
    "use strict";

    /** Remove one day from a sales table. */
    return function deleteSalesRow(data, key, id) {
        var m = data.sales[key];
        if (!m) return { ok: false, error: "That month has no sales table yet." };
        var before = m.rows.length;
        m.rows = m.rows.filter(function (r) { return r.id !== id; });
        return m.rows.length < before ? { ok: true } : { ok: false, error: "Row not found." };
    };
});