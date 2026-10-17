/* Works in the app (window.Crud.<name>) and in Node tests (require). */
(function (root, factory) {
    var isNode = typeof module === "object" && module.exports;
    var fn = factory(isNode ? require("../../logic.js") : root.Logic);
    if (isNode) module.exports = fn;
    else { root.Crud = root.Crud || {}; root.Crud[fn.name] = fn; }
})(typeof self !== "undefined" ? self : this, function (L) {
    "use strict";

    /**
     * Change one cell of a sales row. `field` is "date", or "<stone>.cubes" / "<stone>.price"
     * (for example "Chips.cubes"). `value` is what the user typed. On success returns
     * { ok:true, value } with the cleaned value (hundredths for cubes, cents for price);
     * on failure the row is left untouched.
     */
    return function updateSalesRow(data, key, id, field, value) {
        var m = data.sales[key];
        if (!m) return { ok: false, error: "That month has no sales table yet." };
        var row = null;
        for (var i = 0; i < m.rows.length; i++) if (m.rows[i].id === id) row = m.rows[i];
        if (!row) return { ok: false, error: "Row not found." };

        if (field === "date") {
            if (!L.isValidISO(value) || L.monthKeyOf(value) !== key) {
                return { ok: false, error: "Please choose a date within " + L.monthLabel(key) + "." };
            }
            row.date = value;
            return { ok: true, value: value };
        }

        var parts = String(field).split(".");
        var stone = parts[0], part = parts[1];
        if (L.SALES_STONES.indexOf(stone) === -1 || (part !== "cubes" && part !== "price")) {
            return { ok: false, error: "Unknown field." };
        }
        var n = L.parseMoney(value);
        if (n === null) {
            return { ok: false, error: "Enter a valid number, e.g. 12 or 2.5 (no negatives, max 2 decimals)." };
        }
        row.items[stone][part] = n;
        return { ok: true, value: n };
    };
});