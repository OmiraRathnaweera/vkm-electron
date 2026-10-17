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
   * Update the price-per-cube standard rate for stone categories.
   * Can accept:
   *   updateRates(data, 'Chips', '2500')
   *   updateRates(data, { 'Chips': '2500', 'Dust': 120000 })
   */
  return function updateRates(data, stoneOrMap, rateInput) {
    data.rates = data.rates || L.emptyRates();

    if (typeof stoneOrMap === "object" && stoneOrMap !== null) {
      for (var s in stoneOrMap) {
        if (L.SALES_STONES.indexOf(s) !== -1) {
          var val =
            typeof stoneOrMap[s] === "number"
              ? stoneOrMap[s]
              : L.parseMoney(stoneOrMap[s]);
          if (val !== null && val >= 0) {
            data.rates[s] = val;
          }
        }
      }
      return { ok: true, rates: data.rates };
    }

    var stone = String(stoneOrMap);
    if (L.SALES_STONES.indexOf(stone) === -1) {
      return { ok: false, error: "Unknown stone category: " + stone };
    }

    var cents =
      typeof rateInput === "number" ? rateInput : L.parseMoney(rateInput);
    if (cents === null || cents < 0) {
      return {
        ok: false,
        error: "Enter a valid price per cube (e.g. 2500 or 2,500.00).",
      };
    }

    data.rates[stone] = cents;
    return { ok: true, stone: stone, rate: cents };
  };
});
