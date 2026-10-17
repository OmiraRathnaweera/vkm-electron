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
   * Update the price standard rate for stone categories.
   * Can accept:
   *   updateRates(data, 'Chips', '36000', true)   // price for 3 cubes
   *   updateRates(data, 'Chips', '12000')         // price per 1 cube
   *   updateRates(data, { 'Chips': '36000' }, true)
   */
  return function updateRates(data, stoneOrMap, rateInput, isThreeCubes) {
    data.rates = data.rates || L.emptyRates();
    data.rates3 = data.rates3 || L.emptyRates();

    if (typeof stoneOrMap === "object" && stoneOrMap !== null) {
      for (var s in stoneOrMap) {
        if (L.SALES_STONES.indexOf(s) !== -1) {
          var val =
            typeof stoneOrMap[s] === "number"
              ? stoneOrMap[s]
              : L.parseMoney(stoneOrMap[s]);
          if (val !== null && val >= 0) {
            if (isThreeCubes) {
              data.rates3[s] = val;
              data.rates[s] = Math.round(val / 3);
            } else {
              data.rates[s] = val;
              data.rates3[s] = L.calculatePrice(300, val);
            }
          }
        }
      }
      return { ok: true, rates: data.rates, rates3: data.rates3 };
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
        error: isThreeCubes
          ? "Enter a valid price for 3 cubes (e.g. 36000 or 36,000.00)."
          : "Enter a valid price per cube (e.g. 2500 or 2,500.00).",
      };
    }

    if (isThreeCubes) {
      data.rates3[stone] = cents;
      data.rates[stone] = Math.round(cents / 3);
      return { ok: true, stone: stone, rate: data.rates[stone], rate3: cents };
    } else {
      data.rates[stone] = cents;
      data.rates3[stone] = L.calculatePrice(300, cents);
      return { ok: true, stone: stone, rate: cents, rate3: data.rates3[stone] };
    }
  };
});
