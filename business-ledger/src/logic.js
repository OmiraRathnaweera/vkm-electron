/*
 * Pure calculation / data logic. No DOM and no Electron APIs, so it is shared
 * by the renderer (window.Logic), the main process (require) and the tests.
 *
 * Money is ALWAYS stored as integer cents to avoid floating-point errors
 * (e.g. 0.1 + 0.2 !== 0.3). Only the UI converts to/from display strings.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Logic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));

  /* Row categories shown in the dropdown next to "Description".
     Edit this list to add / rename / reorder options. The first match wins,
     DEFAULT_CATEGORY is used for new rows and for old rows saved before this existed. */
  const CATEGORIES = [
    "Fuel",
    "ABC",
    "3/4",
    "Chips",
    "Dust",
    "Mix",
    "6*9",
    "Others",
  ];
  const DEFAULT_CATEGORY = "Others";
  const isValidCategory = (c) => CATEGORIES.indexOf(c) !== -1;
  /* Reports page: Fuel gets its own "expenditure" figure; the category charts (pie and bar) cover these six. */
  const FUEL_CATEGORY = "Fuel";
  const REPORT_CATEGORIES = ["ABC", "Chips", "Mix", "3/4", "Dust", "6*9"];

  /* Daily stone sales page: the stone types, left to right, as in the paper table. */
  const SALES_STONES = ['ABC', 'Chips', 'Mix', '3/4', '6*9', 'Dust'];

  const pad = (n) => String(n).padStart(2, "0");

  /* ---------------------------------------------------------------- money */

  /**
   * Parse user text into integer cents.
   * "" -> 0, "1,234.5" -> 123450, "12.345" -> null (too many decimals),
   * "-5" / "abc" -> null.
   */
  function parseMoney(input) {
    if (input === null || input === undefined) return 0;
    const s = String(input).trim().replace(/[,\s]/g, "");
    if (s === "") return 0;
    if (!/^(\d+\.?\d{0,2}|\.\d{1,2})$/.test(s)) return null;
    const [whole, frac = ""] = s.split(".");
    if (whole.length > 12) return null;
    return (
      parseInt(whole || "0", 10) * 100 + parseInt((frac + "00").slice(0, 2), 10)
    );
  }

  /** 123456 -> "1,234.56" ; -50 -> "-0.50" */
  function formatMoney(cents) {
    const neg = cents < 0;
    const abs = Math.abs(cents);
    const whole = Math.floor(abs / 100);
    const frac = pad(abs % 100);
    const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-" : "") + grouped + "." + frac;
  }

  /** Plain decimal for CSV / editing: 123456 -> "1234.56" */
  function plainMoney(cents) {
    const neg = cents < 0;
    const abs = Math.abs(cents);
    return (neg ? "-" : "") + Math.floor(abs / 100) + "." + pad(abs % 100);
  }

  /**
 * Cubic volumes are stored like money: whole numbers of hundredths (2.5 cubes -> 250),
 * so sums never drift. Display trims trailing zeros: 250 -> "2.5", 1200 -> "12", 123456 -> "1,234.56".
 * (Typed text is parsed with parseMoney - same rules: up to 2 decimals, no negatives.)
 */
  function formatQty(hundredths) {
    const neg = hundredths < 0;
    const abs = Math.abs(hundredths);
    const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const frac = abs % 100 ? '.' + pad(abs % 100).replace(/0$/, '') : '';
    return (neg ? '-' : '') + whole + frac;
  }
  /* ---------------------------------------------------------------- dates */

  const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

  function isValidISO(s) {
    if (typeof s !== "string" || !ISO_RE.test(s)) return false;
    const d = new Date(s + "T00:00:00Z");
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  }

  function isValidMonthKey(k) {
    return typeof k === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(k);
  }

  function todayISO() {
    const d = new Date();
    return (
      d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate())
    );
  }

  const monthKeyOf = (iso) => iso.slice(0, 7);

  function daysInMonth(key) {
    const [y, m] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function addDays(iso, n) {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /** Monday of the week containing `iso`. */
  function startOfWeek(iso) {
    const d = new Date(iso + "T00:00:00Z");
    const dow = (d.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
    return addDays(iso, -dow);
  }

  function addMonths(key, n) {
    const [y, m] = key.split("-").map(Number);
    const idx = y * 12 + (m - 1) + n;
    return Math.floor(idx / 12) + "-" + pad((idx % 12) + 1);
  }

  function monthLabel(key) {
    const [y, m] = key.split("-").map(Number);
    return MONTH_NAMES[m - 1] + " " + y;
  }

  function dayLabel(iso) {
    const [, m, d] = iso.split("-").map(Number);
    return MONTH_SHORT[m - 1] + " " + d;
  }

  /* ----------------------------------------------------------------- data */

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  function defaultData() {
    return {
      version: 1,
      settings: { businessName: "My Business", currency: "Rs." },
      months: {},
      sales: {},
    };
  }

  const toCents = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : 0);

  /** Defensive clean-up of anything loaded from disk or imported from a backup. */
  function normalizeData(raw) {
    const out = defaultData();
    if (!raw || typeof raw !== "object") return out;

    if (raw.settings && typeof raw.settings === "object") {
      if (typeof raw.settings.businessName === "string") {
        out.settings.businessName =
          raw.settings.businessName.trim().slice(0, 80) ||
          out.settings.businessName;
      }
      if (typeof raw.settings.currency === "string") {
        out.settings.currency = raw.settings.currency.slice(0, 8);
      }
    }

    const sales = raw.sales && typeof raw.sales === "object" ? raw.sales : {};
    for (const key of Object.keys(sales)) {
      if (!isValidMonthKey(key)) continue;
      const rows =
        sales[key] && Array.isArray(sales[key].rows) ? sales[key].rows : [];
      const seen = new Set();
      out.sales[key] = {
        rows: rows
          .filter((r) => r && typeof r === "object")
          .map((r) => {
            const id =
              typeof r.id === "string" && r.id && !seen.has(r.id)
                ? r.id
                : uid();
            seen.add(id);
            const items = emptySalesItems();
            for (const s of SALES_STONES) {
              const it = r.items && r.items[s];
              if (it && typeof it === "object") {
                items[s] = {
                  cubes: toCents(it.cubes),
                  price: toCents(it.price),
                };
              }
            }
            return {
              id,
              date: typeof r.date === "string" ? r.date : "",
              items,
            };
          }),
      };
    }

    const months =
      raw.months && typeof raw.months === "object" ? raw.months : {};
    for (const key of Object.keys(months)) {
      if (!isValidMonthKey(key)) continue;
      const m = months[key] || {};
      const rows = Array.isArray(m.rows) ? m.rows : [];
      const seen = new Set();
      out.months[key] = {
        opening: Number.isSafeInteger(m.opening) ? m.opening : null,
        rows: rows
          .filter((r) => r && typeof r === "object")
          .map((r) => {
            let id =
              typeof r.id === "string" && r.id && !seen.has(r.id)
                ? r.id
                : uid();
            seen.add(id);
            return {
              id,
              date: typeof r.date === "string" ? r.date : "",
              desc: typeof r.desc === "string" ? r.desc.slice(0, 300) : "",
              category: isValidCategory(r.category)
                ? r.category
                : DEFAULT_CATEGORY,
              receipt: toCents(r.receipt),
              payment: toCents(r.payment),
            };
          }),
      };
    }
    return out;
  }

  /** A row's date, falling back to the 1st of its month if blank/out of range. */
  function effectiveDate(key, row) {
    return isValidISO(row.date) && monthKeyOf(row.date) === key
      ? row.date
      : key + "-01";
  }

  /**
   * Compute every month: opening balance, running balance per row, totals, closing.
   * A month's opening balance is its manual override, or the closing balance of
   * the closest earlier month that exists (so skipped months are carried across).
   */
  function computeAll(data) {
    const keys = Object.keys(data.months).sort();
    const out = {};
    let prevClosing = 0;
    let prevKey = null;
    for (const key of keys) {
      const m = data.months[key];
      const manual = m.opening !== null && m.opening !== undefined;
      const opening = manual ? m.opening : prevClosing;
      let bal = opening;
      let totalReceipts = 0;
      let totalPayments = 0;
      const balances = {};
      for (const r of m.rows) {
        totalReceipts += r.receipt;
        totalPayments += r.payment;
        bal += r.receipt - r.payment;
        balances[r.id] = bal;
      }
      out[key] = {
        key,
        opening,
        openingIsManual: manual,
        carriedFrom: manual ? null : prevKey,
        balances,
        totalReceipts,
        totalPayments,
        net: totalReceipts - totalPayments,
        closing: bal,
      };
      prevClosing = bal;
      prevKey = key;
    }
    return out;
  }

  /** Opening balance a not-yet-created month would start with. */
  function suggestedOpening(computed, key) {
    const earlier = Object.keys(computed)
      .filter((k) => k < key)
      .sort();
    if (!earlier.length) return { cents: 0, from: null };
    const from = earlier[earlier.length - 1];
    return { cents: computed[from].closing, from };
  }

  /** Balance at the end of day `iso` (carrying across missing months). */
  function balanceAtEndOf(data, computed, iso) {
    const key = monthKeyOf(iso);
    const keys = Object.keys(computed)
      .filter((k) => k <= key)
      .sort();
    if (!keys.length) return 0;
    const last = keys[keys.length - 1];
    if (last < key) return computed[last].closing;
    let bal = computed[last].opening;
    for (const r of data.months[last].rows) {
      if (effectiveDate(last, r) <= iso) bal += r.receipt - r.payment;
    }
    return bal;
  }

  /* ---------------------------------------------------------- stone sales */

  function emptySalesItems() {
    const items = {};
    for (const s of SALES_STONES) items[s] = { cubes: 0, price: 0 };
    return items;
  }

  /**
   * Figures for one month of stone sales.
   *   perStone[stone] = { cubes, sales }  total cubic volume and total sales of that stone
   *   rowTotals[id]   = daily total sales of that row (sum of its stones' prices)
   *   totalCubes      = cubic volume of all stones together
   *   totalSales      = overall total sales
   */
  function computeSalesMonth(month) {
    const perStone = {};
    for (const s of SALES_STONES) perStone[s] = { cubes: 0, sales: 0 };
    const rowTotals = {};
    let totalCubes = 0;
    let totalSales = 0;
    for (const r of (month && month.rows) || []) {
      let day = 0;
      for (const s of SALES_STONES) {
        const it = (r.items && r.items[s]) || { cubes: 0, price: 0 };
        perStone[s].cubes += it.cubes;
        perStone[s].sales += it.price;
        totalCubes += it.cubes;
        day += it.price;
      }
      rowTotals[r.id] = day;
      totalSales += day;
    }
    return { perStone, rowTotals, totalCubes, totalSales };
  }

  function salesMonthToCSV(data, key) {
    const m = data.sales[key];
    const c = computeSalesMonth(m);
    const head = ['Date'];
    for (const s of SALES_STONES) head.push(s + ' Cubes', s + ' Price');
    head.push('Daily Total Sales');
    const lines = [head];
    for (const r of m.rows) {
      const line = [r.date];
      for (const s of SALES_STONES) {
        const it = r.items[s];
        line.push(it.cubes ? plainMoney(it.cubes) : '', it.price ? plainMoney(it.price) : '');
      }
      line.push(plainMoney(c.rowTotals[r.id]));
      lines.push(line);
    }
    const total = ['Total'];
    for (const s of SALES_STONES) total.push(plainMoney(c.perStone[s].cubes), plainMoney(c.perStone[s].sales));
    total.push(plainMoney(c.totalSales));
    lines.push(total);
    return lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  /* -------------------------------------------------------------- reports */

  function flatRows(data) {
    const rows = [];
    for (const key of Object.keys(data.months)) {
      for (const r of data.months[key].rows) {
        rows.push({
          date: effectiveDate(key, r),
          desc: r.desc,
          category: r.category,
          receipt: r.receipt,
          payment: r.payment,
        });
      }
    }
    return rows;
  }

  function groupByDescription(rows, field) {
    const map = new Map();
    for (const r of rows) {
      const amount = r[field];
      if (!amount) continue;
      const label = r.desc.trim() || "(no description)";
      const k = label.toLowerCase();
      const cur = map.get(k) || { label, amount: 0 };
      cur.amount += amount;
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }

  function topN(list, n) {
    if (list.length <= n) return list;
    const head = list.slice(0, n);
    const rest = list.slice(n).reduce((s, x) => s + x.amount, 0);
    return head.concat([{ label: "Other", amount: rest }]);
  }

  /**
   * Build everything the Reports page needs.
   *  period: 'week' (anchor = any date in that week, Monday-Sunday)
   *          'month' (anchor = 'YYYY-MM')   'year' (anchor = 'YYYY')
   */
  function buildReport(data, period, anchor) {
    const computed = computeAll(data);
    const rows = flatRows(data);
    let start, end, title;
    let labels = [];
    let bucketEnds = [];
    let bucketOf;

    if (period === "week") {
      start = startOfWeek(anchor);
      end = addDays(start, 6);
      title = dayLabel(start) + " – " + dayLabel(end) + ", " + end.slice(0, 4);
      for (let i = 0; i < 7; i++) {
        const d = addDays(start, i);
        labels.push(
          ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i] +
          " " +
          Number(d.slice(8)),
        );
        bucketEnds.push(d);
      }
      bucketOf = (iso) => bucketEnds.indexOf(iso);
    } else if (period === "month") {
      start = anchor + "-01";
      end = anchor + "-" + pad(daysInMonth(anchor));
      title = monthLabel(anchor);
      for (let i = 1; i <= daysInMonth(anchor); i++) {
        labels.push(String(i));
        bucketEnds.push(anchor + "-" + pad(i));
      }
      bucketOf = (iso) => Number(iso.slice(8)) - 1;
    } else {
      start = anchor + "-01-01";
      end = anchor + "-12-31";
      title = String(anchor);
      for (let m = 1; m <= 12; m++) {
        labels.push(MONTH_SHORT[m - 1]);
        bucketEnds.push(
          anchor + "-" + pad(m) + "-" + pad(daysInMonth(anchor + "-" + pad(m))),
        );
      }
      bucketOf = (iso) => Number(iso.slice(5, 7)) - 1;
    }

    const receipts = labels.map(() => 0);
    const payments = labels.map(() => 0);
    const inRange = rows.filter((r) => r.date >= start && r.date <= end);

    // Totals per category (receipts and payments) for the period.
    const byCategory = {};
    for (const c of CATEGORIES) byCategory[c] = { receipts: 0, payments: 0 };
    for (const r of inRange) {
      const c = isValidCategory(r.category) ? r.category : DEFAULT_CATEGORY;
      byCategory[c].receipts += r.receipt;
      byCategory[c].payments += r.payment;
    }
    for (const r of inRange) {
      const i = bucketOf(r.date);
      if (i < 0) continue;
      receipts[i] += r.receipt;
      payments[i] += r.payment;
    }

    const totalReceipts = receipts.reduce((a, b) => a + b, 0);
    const totalPayments = payments.reduce((a, b) => a + b, 0);

    // Opening balance of the period (use a month's own opening if the period
    // starts on the 1st of an existing month, so a manual opening is honoured).
    const startKey = monthKeyOf(start);
    const opening =
      start.endsWith("-01") && computed[startKey]
        ? computed[startKey].opening
        : balanceAtEndOf(data, computed, addDays(start, -1));
    const closing = balanceAtEndOf(data, computed, end);
    const balance = bucketEnds.map((d) => balanceAtEndOf(data, computed, d));

    return {
      period,
      anchor,
      start,
      end,
      title,
      labels,
      receipts,
      payments,
      balance,
      totals: {
        receipts: totalReceipts,
        payments: totalPayments,
        net: totalReceipts - totalPayments,
        opening,
        closing,
      },
      count: inRange.length,
      byCategory,
      fuel: byCategory[FUEL_CATEGORY].payments, // total spent on fuel in the period
      receiptSources: topN(groupByDescription(inRange, "receipt"), 6),
      paymentSources: topN(groupByDescription(inRange, "payment"), 6),
    };
  }

  /* ------------------------------------------------------------------ CSV */

  function csvCell(v) {
    const s = String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function monthToCSV(data, key) {
    const computed = computeAll(data);
    const c = computed[key];
    const m = data.months[key];
    const lines = [
      ["Date", "Description", "Category", "Receipts", "Payments", "Balance"],
    ];
    lines.push(["", "Opening balance", "", "", "", plainMoney(c.opening)]);
    for (const r of m.rows) {
      lines.push([
        r.date,
        r.desc,
        r.category || DEFAULT_CATEGORY,
        r.receipt ? plainMoney(r.receipt) : "",
        r.payment ? plainMoney(r.payment) : "",
        plainMoney(c.balances[r.id]),
      ]);
    }
    lines.push([
      "",
      "TOTAL",
      "",
      plainMoney(c.totalReceipts),
      plainMoney(c.totalPayments),
      plainMoney(c.closing),
    ]);
    return lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n";
  }

  return {
    MONTH_NAMES,
    MONTH_SHORT,
    CATEGORIES,
    DEFAULT_CATEGORY,
    isValidCategory,
    FUEL_CATEGORY,
    REPORT_CATEGORIES,
    parseMoney,
    formatMoney,
    plainMoney,
    isValidISO,
    isValidMonthKey,
    todayISO,
    monthKeyOf,
    daysInMonth,
    addDays,
    startOfWeek,
    addMonths,
    monthLabel,
    dayLabel,
    uid,
    defaultData,
    normalizeData,
    effectiveDate,
    computeAll,
    suggestedOpening,
    balanceAtEndOf,
    buildReport,
    monthToCSV,
    formatQty,
    SALES_STONES, 
    emptySalesItems, 
    computeSalesMonth, 
    salesMonthToCSV,
  };
});
